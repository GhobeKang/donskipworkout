"""Run notification delivery and photo cleanup separately from HTTP processes."""

import argparse
import asyncio
import logging
import signal
from pathlib import Path
from uuid import uuid4

from .account_deletion import run_photo_cleanup
from .config import serverSettings
from .database import create_database, create_session_factory
from .middleware import configure_logging
from .notification_worker import run_notification_worker
from .worker_status import (
    acquire_worker_lease,
    publish_worker_state,
    read_worker_state,
    release_worker_lease,
    worker_lease_wait_seconds,
)

logger = logging.getLogger(__name__)
instance_path = Path('/tmp/attendance-worker-instance')


async def run_worker(settings, stop_event):
    engine = create_database(settings.database_connection_url())
    session_factory = create_session_factory(engine)
    instance_id = str(uuid4())
    state = {'running': False, 'fcm_initialized': False, 'apns_initialized': False,
             'last_error': 'provider_not_configured'}
    tasks = []
    owns_lease = False
    try:
        lease_expiry = None
        for attempt in range(3):
            with session_factory() as database:
                lease_expiry = acquire_worker_lease(database, instance_id)
                wait_seconds = worker_lease_wait_seconds(database) if lease_expiry is None else 0
            if lease_expiry is not None:
                break
            if attempt == 2:
                break
            logger.warning('worker_waiting_for_previous_lease seconds=%s', wait_seconds)
            while wait_seconds > 0:
                pause_seconds = min(30, wait_seconds)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=pause_seconds)
                    return
                except TimeoutError:
                    wait_seconds -= pause_seconds
        if lease_expiry is None:
            raise RuntimeError('maintenance_worker_already_running')
        owns_lease = True
        instance_path.write_text(instance_id, encoding='utf-8')

        def heartbeat():
            with session_factory() as database:
                publish_worker_state(database, instance_id, state.copy())

        async def maintain_lease():
            while True:
                await asyncio.to_thread(heartbeat)
                # Publish startup readiness promptly, then avoid a write on every poll.
                starting_provider = (settings.firebase_project_id or settings.apns_key_id) and not state.get('last_delivery_at')
                await asyncio.sleep(5 if starting_provider else 60)

        tasks.append(asyncio.create_task(maintain_lease()))
        tasks.append(asyncio.create_task(run_photo_cleanup(session_factory, settings.photo_storage_dir)))
        if settings.firebase_project_id or settings.apns_key_id:
            tasks.append(asyncio.create_task(run_notification_worker(
                session_factory, settings.firebase_project_id, settings.firebase_credentials_path,
                settings.apns_key_id, settings.apns_team_id, settings.apns_auth_key_path,
                settings.apns_topic, settings.apns_environment,
                settings.notification_catalog_path, state, instance_id=instance_id,
            )))
        stopped = asyncio.create_task(stop_event.wait())
        tasks.append(stopped)
        completed, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        if stopped not in completed:
            for task in completed:
                task.result()
            raise RuntimeError('maintenance_task_stopped')
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if owns_lease:
            try:
                with session_factory() as database:
                    release_worker_lease(database, instance_id)
            except Exception as error:
                logger.error('worker_release_failed error_type=%s', type(error).__name__)
        engine.dispose()


async def serve(settings):
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_number in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signal_number, stop_event.set)
    await run_worker(settings, stop_event)


def healthcheck(settings):
    if not instance_path.exists():
        return 1
    engine = create_database(settings.database_connection_url())
    try:
        with create_session_factory(engine)() as database:
            state = read_worker_state(database, instance_path.read_text(encoding='utf-8').strip())
            return 0 if state.get('healthy') else 1
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--healthcheck', action='store_true')
    arguments = parser.parse_args()
    settings = serverSettings()
    configure_logging(settings)
    try:
        if arguments.healthcheck:
            return healthcheck(settings)
        asyncio.run(serve(settings))
        return 0
    except Exception as error:
        logger.error('maintenance_worker_stopped error_type=%s', type(error).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
