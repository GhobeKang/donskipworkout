import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .challenge_routes import router as challenge_router
from .coaching_routes import router as coaching_router
from .config import serverSettings
from .database import create_database, create_session_factory
from .middleware import configure_logging, requestSecurityMiddleware
from .notification_routes import router as notification_router
from .photo_routes import router as photo_router
from .routes import router
from .timer_routes import router as timer_router
from .workouts import router as workout_router


def create_app(settings=None, database_engine=None):
    settings = settings or serverSettings()
    configure_logging(settings)
    engine = (
        database_engine
        if database_engine is not None
        else create_database(settings.database_connection_url())
    )

    @asynccontextmanager
    async def lifespan(app):
        notification_worker = None
        if settings.firebase_project_id or settings.apns_key_id:
            from .notification_worker import run_notification_worker

            notification_worker = asyncio.create_task(
                run_notification_worker(
                    app.state.session_factory,
                    settings.firebase_project_id,
                    settings.firebase_credentials_path,
                    settings.apns_key_id,
                    settings.apns_team_id,
                    settings.apns_auth_key_path,
                    settings.apns_topic,
                    settings.apns_environment,
                )
            )
        try:
            yield
        finally:
            if notification_worker:
                notification_worker.cancel()
                with suppress(asyncio.CancelledError):
                    await notification_worker
            engine.dispose()

    app = FastAPI(
        title='운동 출석 API',
        version='0.1.0',
        lifespan=lifespan,
        docs_url='/docs' if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url='/openapi.json' if settings.docs_enabled else None,
    )
    app.state.settings = settings
    app.state.session_factory = create_session_factory(engine)
    app.include_router(router)
    app.include_router(challenge_router)
    app.include_router(coaching_router)
    app.include_router(photo_router)
    app.include_router(workout_router)
    app.include_router(timer_router)
    app.include_router(notification_router)

    @app.get('/health')
    def health():
        # Liveness only; deliberately does not expose DB details.
        return {'status': 'ok'}

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        # Pydantic's input/context can contain passwords or malicious input.
        return JSONResponse(
            status_code=422,
            content={
                'detail': '요청 형식이 올바르지 않습니다.',
                'errors': [{'type': item['type']} for item in error.errors()],
            },
        )

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=['GET', 'POST', 'PUT', 'DELETE'],
        allow_headers=['Content-Type'],
        expose_headers=['X-Request-ID'],
    )
    app.add_middleware(requestSecurityMiddleware, settings=settings)
    return app
