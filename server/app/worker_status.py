"""One maintenance process, with expiring ownership and shared API diagnostics."""

from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from .database import workerLease
from .security import utc_now

worker_name = 'maintenance'
lease_duration = timedelta(seconds=120)
status_fields = (
    'running', 'fcm_initialized', 'apns_initialized', 'last_error',
    'last_schedule_at', 'last_delivery_at',
)


def acquire_worker_lease(database, instance_id):
    database_now = func.timezone('UTC', func.clock_timestamp())
    statement = insert(workerLease).values(
        worker_name=worker_name, instance_id=instance_id,
        heartbeat_at=database_now, lease_expires_at=database_now + lease_duration,
        worker_state={'running': False, 'last_error': 'worker_starting'},
    )
    expiry = database.scalar(statement.on_conflict_do_update(
        index_elements=['worker_name'],
        set_={field: getattr(statement.excluded, field) for field in (
            'instance_id', 'heartbeat_at', 'lease_expires_at', 'worker_state',
        )},
        where=workerLease.lease_expires_at <= database_now,
    ).returning(workerLease.lease_expires_at))
    database.commit()
    return expiry


def publish_worker_state(database, instance_id, state):
    database_now = func.timezone('UTC', func.clock_timestamp())
    expiry = database.scalar(update(workerLease).where(
        workerLease.worker_name == worker_name, workerLease.instance_id == instance_id,
        workerLease.lease_expires_at > database_now,
    ).values(
        heartbeat_at=database_now, lease_expires_at=database_now + lease_duration,
        worker_state={field: state[field] for field in status_fields if field in state},
    ).returning(workerLease.lease_expires_at))
    database.commit()
    if expiry is None:
        raise RuntimeError('worker_lease_lost')
    return expiry


def worker_lease_wait_seconds(database):
    database_now = func.timezone('UTC', func.clock_timestamp())
    expiry_seconds = database.scalar(select(func.extract(
        'epoch', workerLease.lease_expires_at - database_now,
    )).where(workerLease.worker_name == worker_name))
    return min(121, max(1, int(expiry_seconds or 0) + 1))


def release_worker_lease(database, instance_id):
    database_now = func.timezone('UTC', func.clock_timestamp())
    database.execute(update(workerLease).where(
        workerLease.worker_name == worker_name, workerLease.instance_id == instance_id,
    ).values(lease_expires_at=database_now, worker_state={
        'running': False, 'last_error': 'worker_stopped',
    }))
    database.commit()


def read_worker_state(database, instance_id=None):
    lease = database.scalar(select(workerLease).where(workerLease.worker_name == worker_name))
    if lease is None or (instance_id is not None and lease.instance_id != instance_id):
        return {'running': False, 'last_error': 'worker_not_running'}
    if lease.lease_expires_at <= utc_now() or utc_now() - lease.heartbeat_at > timedelta(seconds=90):
        return {'running': False, 'last_error': 'worker_heartbeat_expired'}
    return {**lease.worker_state, 'healthy': True}
