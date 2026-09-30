import asyncio
import logging
import time
import traceback
from collections import OrderedDict
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from pathlib import Path
from uuid import uuid4

from starlette.responses import JSONResponse

from .photo_processing import max_upload_bytes

request_id_context = ContextVar('request_id', default='-')
logger = logging.getLogger('attendance.requests')


class requestLogFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_context.get()
        return True


def configure_logging(settings):
    log_path = Path(settings.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handlers = [
        logging.StreamHandler(),
        RotatingFileHandler(
            log_path,
            maxBytes=5_000_000,
            backupCount=5,
            encoding='utf-8',
        ),
    ]
    for handler in handlers:
        handler.addFilter(requestLogFilter())
        handler.setFormatter(
            logging.Formatter(
                '%(asctime)s %(levelname)s %(name)s request_id=%(request_id)s %(message)s',
            )
        )
    logging.basicConfig(level=settings.log_level, handlers=handlers, force=True)
    # INFO emits SQL with placeholders. SQLAlchemy DEBUG also emits result rows,
    # which must never be enabled, even when application logging is DEBUG.
    logging.getLogger('sqlalchemy.engine').setLevel(
        logging.INFO if settings.log_level == 'DEBUG' else logging.WARNING,
    )


def log_exception(error):
    frames = traceback.extract_tb(error.__traceback__)
    locations = ' > '.join(
        f'{Path(frame.filename).name}:{frame.lineno}:{frame.name}' for frame in frames
    )
    original_error = getattr(error, 'orig', error)
    database_error_code = getattr(original_error, 'sqlstate', None)
    logger.error(
        'exception_type=%s database_error_code=%s stack=%s',
        type(error).__name__,
        database_error_code,
        locations,
    )


class requestSecurityMiddleware:
    def __init__(self, app, settings):
        self.app = app
        self.settings = settings
        self.rate_buckets = OrderedDict()

    def rate_allowed(self, key, limit, now):
        # Bounded, process-local limiter. A gateway/shared limiter is required
        # when deploying multiple workers or instances.
        while self.rate_buckets:
            oldest_key, (started_at, _) = next(iter(self.rate_buckets.items()))
            if now - started_at < 60:
                break
            self.rate_buckets.pop(oldest_key)
        bucket = self.rate_buckets.get(key)
        if bucket is None:
            if len(self.rate_buckets) >= 10000:
                return False
            self.rate_buckets[key] = (now, 1)
            return True
        started_at, count = bucket
        self.rate_buckets[key] = (started_at, count + 1)
        return count < limit

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        request_id = str(uuid4())
        context_token = request_id_context.set(request_id)
        started_at = time.monotonic()
        status_code = 500
        received_bytes = 0
        sent_bytes = 0
        response_started = False

        async def tracked_send(message):
            nonlocal status_code, sent_bytes, response_started
            if message['type'] == 'http.response.start':
                response_started = True
                status_code = message['status']
                message['headers'] = list(message.get('headers', [])) + [
                    (b'x-request-id', request_id.encode()),
                    (b'x-content-type-options', b'nosniff'),
                    (b'x-frame-options', b'DENY'),
                    (b'cache-control', b'no-store'),
                    (b'referrer-policy', b'no-referrer'),
                ]
            elif message['type'] == 'http.response.body':
                sent_bytes += len(message.get('body', b''))
            await send(message)

        async def reject(code, detail, headers=None):
            await JSONResponse({'detail': detail}, status_code=code, headers=headers)(
                scope, receive, tracked_send
            )

        try:
            client_ip = (scope.get('client') or ('unknown', 0))[0]
            if not self.rate_allowed(
                ('all', client_ip), self.settings.rate_limit_per_minute, started_at
            ):
                return await reject(429, '요청이 너무 많습니다.', {'Retry-After': '60'})
            if scope['path'].startswith('/api/v1/auth/') and not self.rate_allowed(
                ('auth', client_ip),
                self.settings.auth_rate_limit_per_minute,
                started_at,
            ):
                return await reject(429, '인증 요청이 너무 많습니다.', {'Retry-After': '60'})
            headers = dict(scope['headers'])
            is_photo_upload = (
                scope['path'] == '/api/v1/sessions/today/photo' and scope['method'] == 'POST'
            )
            body_limit = (
                max_upload_bytes + 16384 if is_photo_upload else self.settings.max_body_bytes
            )
            if is_photo_upload:
                origin = headers.get(b'origin', b'').decode('utf-8', errors='replace')
                if origin not in self.settings.cors_origins:
                    return await reject(403, '허용되지 않은 사진 업로드 요청입니다.')
            content_length = headers.get(b'content-length')
            if content_length is not None:
                try:
                    size = int(content_length)
                except ValueError:
                    return await reject(400, '잘못된 Content-Length입니다.')
                if size < 0:
                    return await reject(400, '잘못된 Content-Length입니다.')
                if size > body_limit:
                    return await reject(413, '요청 본문이 너무 큽니다.')
            if scope['method'] in {'POST', 'PUT', 'PATCH'}:
                content_type = headers.get(b'content-type', b'').split(b';')[0].strip().lower()
                if is_photo_upload and content_type != b'multipart/form-data':
                    return await reject(415, '사진 파일 업로드가 필요합니다.')
                if not is_photo_upload and content_type != b'application/json':
                    return await reject(415, 'application/json 요청이 필요합니다.')
            messages = []
            async with asyncio.timeout(30 if is_photo_upload else 10):
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        status_code = 499
                        return
                    received_bytes += len(message.get('body', b''))
                    if received_bytes > body_limit:
                        return await reject(413, '요청 본문이 너무 큽니다.')
                    messages.append(message)
                    if not message.get('more_body', False):
                        break

            async def buffered_receive():
                if messages:
                    return messages.pop(0)
                return await receive()

            logger.debug('request_received method=%s bytes=%s', scope['method'], received_bytes)
            await self.app(scope, buffered_receive, tracked_send)
        except TimeoutError:
            if not response_started:
                await reject(408, '요청 시간이 초과되었습니다.')
        except Exception as error:
            log_exception(error)
            if not response_started:
                await reject(500, '서버 오류가 발생했습니다.')
        finally:
            route = scope.get('route')
            route_path = getattr(route, 'path', '<unmatched>')
            log_method = logger.warning if status_code >= 400 else logger.info
            log_method(
                'request_complete method=%s route=%s status=%s received_bytes=%s sent_bytes=%s duration_ms=%.2f',
                scope['method'],
                route_path,
                status_code,
                received_bytes,
                sent_bytes,
                (time.monotonic() - started_at) * 1000,
            )
            request_id_context.reset(context_token)
