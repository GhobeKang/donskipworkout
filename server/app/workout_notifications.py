from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import exists, or_, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import noload

from .database import (
    attendanceSetting,
    notificationEvent,
    notificationOutbox,
    pushDevice,
    scheduleDay,
    userAccount,
    workoutSession,
)

workout_category = 'workout_reminder'
notification_lifetime = timedelta(minutes=10)
schedule_lookahead = timedelta(seconds=60)
departure_checkin_delay = timedelta(hours=3)


def parse_notification_time(value):
    if not isinstance(value, str):
        return None
    try:
        parsed_time = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed_time.tzinfo is None:
            return None
        return parsed_time.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def scheduled_utc(workout_date, workout_time, timezone_name):
    local_timezone = ZoneInfo(timezone_name)
    local_wall_time = datetime.combine(workout_date, workout_time)
    candidates = []
    for fold in (0, 1):
        utc_candidate = local_wall_time.replace(tzinfo=local_timezone, fold=fold).astimezone(
            timezone.utc
        )
        returned_wall_time = utc_candidate.astimezone(local_timezone).replace(tzinfo=None)
        candidates.append((returned_wall_time - local_wall_time, utc_candidate))
    exact_candidates = [candidate for difference, candidate in candidates if not difference]
    if exact_candidates:
        return min(exact_candidates).replace(tzinfo=None)
    # Move nonexistent wall-clock times forward through a daylight-saving gap.
    forward_candidates = [
        (difference, candidate) for difference, candidate in candidates if difference > timedelta(0)
    ]
    return min(forward_candidates)[1].replace(tzinfo=None)


def build_workout_candidates(account, settings, weekdays, session, workout_date):
    if session and session.session_status in {'completed', 'rest', 'missed'}:
        return []
    if session and session.session_status == 'started':
        if settings.notification_missed_enabled and session.started_at is not None:
            return [('departure_unverified', session.started_at + departure_checkin_delay)]
        return []
    is_schedule_day = (workout_date.weekday() + 1) % 7 in weekdays
    if not is_schedule_day:
        if settings.notification_free_workout_enabled and session is None:
            return [
                (
                    'free_workout',
                    scheduled_utc(workout_date, settings.workout_time, account.timezone),
                )
            ]
        return []
    workout_time = session.scheduled_time if session else settings.workout_time
    start_at = scheduled_utc(workout_date, workout_time, account.timezone)
    candidates = []
    snoozed = session and session.snooze_count > 0
    not_started = session is None or session.session_status == 'scheduled'
    if not_started and snoozed:
        if settings.notification_snooze_enabled:
            candidates.append(('snooze', start_at))
    elif not_started and settings.notification_workout_enabled:
        candidates.append(('workout', start_at - timedelta(minutes=30)))
    if settings.notification_missed_enabled:
        candidates.extend(
            (f'missed_{number}', start_at + timedelta(minutes=30 * number))
            for number in range(1, 4)
        )
    return candidates


def notification_content(catalog, notification_kind, roast_level, workout_time, event_key):
    content_kind = 'missed' if notification_kind.startswith('missed_') else notification_kind
    defaults = catalog['defaults'].get(content_kind) or catalog['defaults']['missed']
    roast_message_key = (
        'departure_messages_by_roast_level'
        if content_kind == 'departure_unverified'
        else 'messages_by_roast_level'
    )
    roast_messages = (
        []
        if content_kind == 'free_workout'
        else (catalog.get(roast_message_key, {}).get(roast_level, []))
    )
    message_index = int(sha256(event_key.encode()).hexdigest()[:8], 16)
    body = (
        roast_messages[message_index % len(roast_messages)] if roast_messages else defaults['body']
    )
    return (
        defaults['title'].replace('{workout_time}', workout_time)[:100],
        body.replace('{workout_time}', workout_time)[:300],
    )


def enqueue_due_workout_notifications(session_factory, catalog, enabled_providers, now=None):
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    if not enabled_providers:
        return 0
    with session_factory() as database:
        has_ready_device = exists(
            select(pushDevice.device_id).where(
                pushDevice.user_id == userAccount.user_id,
                pushDevice.active.is_(True),
                pushDevice.workout_push_enabled.is_(True),
                pushDevice.provider.in_(enabled_providers),
            )
        )
        accounts = database.execute(
            select(userAccount, attendanceSetting)
            .join(attendanceSetting, attendanceSetting.user_id == userAccount.user_id)
            .where(
                has_ready_device,
                or_(
                    attendanceSetting.notification_workout_enabled.is_(True),
                    attendanceSetting.notification_free_workout_enabled.is_(True),
                    attendanceSetting.notification_missed_enabled.is_(True),
                    attendanceSetting.notification_snooze_enabled.is_(True),
                ),
            )
        ).all()
        if not accounts:
            return 0
        user_ids = [account.user_id for account, _ in accounts]
        weekdays_by_user = defaultdict(set)
        for user_id, weekday in database.execute(
            select(scheduleDay.user_id, scheduleDay.day_of_week).where(
                scheduleDay.user_id.in_(user_ids)
            )
        ):
            weekdays_by_user[user_id].add(weekday)
        sessions = database.scalars(
            select(workoutSession)
            .options(noload(workoutSession.photos), noload(workoutSession.workout_sets))
            .where(
                workoutSession.user_id.in_(user_ids),
                workoutSession.workout_date >= now.date() - timedelta(days=2),
                workoutSession.workout_date <= now.date() + timedelta(days=2),
            )
        ).all()
        sessions_by_date = {
            (session.user_id, session.workout_date): session for session in sessions
        }
        devices_by_user = defaultdict(list)
        for device in database.scalars(
            select(pushDevice).where(
                pushDevice.user_id.in_(user_ids),
                pushDevice.active.is_(True),
                pushDevice.workout_push_enabled.is_(True),
                pushDevice.provider.in_(enabled_providers),
            )
        ):
            devices_by_user[device.user_id].append(device.device_id)
        insert = postgres_insert if database.bind.dialect.name == 'postgresql' else sqlite_insert
        created_count = 0
        for account, settings in accounts:
            local_date = (
                now.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(account.timezone)).date()
            )
            for day_offset in (-1, 0, 1):
                workout_date = local_date + timedelta(days=day_offset)
                session = sessions_by_date.get((account.user_id, workout_date))
                for notification_kind, send_at in build_workout_candidates(
                    account, settings, weekdays_by_user[account.user_id], session, workout_date
                ):
                    expires_at = send_at + notification_lifetime
                    if send_at > now + schedule_lookahead or expires_at <= now:
                        continue
                    event_key = f'workout:{account.user_id}:{workout_date}:{notification_kind}:{send_at.isoformat()}'
                    workout_time = (
                        session.scheduled_time if session else settings.workout_time
                    ).strftime('%H:%M')
                    title, body = notification_content(
                        catalog, notification_kind, settings.roast_level, workout_time, event_key
                    )
                    payload = {
                        'workout_date': workout_date.isoformat(),
                        'notification_kind': notification_kind,
                        'scheduled_at': send_at.isoformat() + 'Z',
                        'expires_at': expires_at.isoformat() + 'Z',
                    }
                    english_catalog = catalog.get('localized', {}).get('en')
                    if english_catalog:
                        payload['title_en'], payload['body_en'] = notification_content(
                            english_catalog,
                            notification_kind,
                            settings.roast_level,
                            workout_time,
                            event_key,
                        )
                    event_id = database.scalar(
                        insert(notificationEvent)
                        .values(
                            event_uuid=str(uuid4()),
                            event_key=event_key,
                            category=workout_category,
                            recipient_user_id=account.user_id,
                            title=title,
                            body=body,
                            payload=payload,
                            created_at=now,
                        )
                        .on_conflict_do_nothing(index_elements=['event_key'])
                        .returning(notificationEvent.event_id)
                    )
                    if event_id is None:
                        event_id = database.scalar(
                            select(notificationEvent.event_id).where(
                                notificationEvent.event_key == event_key
                            )
                        )
                    else:
                        created_count += 1
                    for device_id in devices_by_user[account.user_id]:
                        database.execute(
                            insert(notificationOutbox)
                            .values(
                                event_id=event_id,
                                device_id=device_id,
                                status='queued',
                                attempt_count=0,
                                next_attempt_at=send_at,
                                created_at=now,
                            )
                            .on_conflict_do_nothing(index_elements=['event_id', 'device_id'])
                        )
        database.commit()
        return created_count


def notification_cancellation_reason(database, event, device, now):
    from .community_safety import users_are_blocked
    from .database import userCredential

    if not device.active or device.user_id != event.recipient_user_id:
        return 'device_inactive_or_reassigned'
    recipient_credential = database.get(userCredential, event.recipient_user_id)
    if recipient_credential is None or not recipient_credential.is_active:
        return 'account_inactive'
    if event.sender_user_id is not None:
        sender_credential = database.get(userCredential, event.sender_user_id)
        if sender_credential is None or not sender_credential.is_active:
            return 'sender_inactive'
        if users_are_blocked(database, event.sender_user_id, event.recipient_user_id):
            return 'user_blocked'
    if event.category not in {workout_category, 'push_test'}:
        return None
    expires_at = parse_notification_time(event.payload.get('expires_at'))
    if expires_at is None or expires_at <= now:
        return 'notification_expired'
    if event.category == 'push_test':
        return None
    if not device.workout_push_enabled:
        return 'local_cleanup_not_completed'
    try:
        workout_date = date.fromisoformat(event.payload['workout_date'])
    except (KeyError, ValueError):
        return 'invalid_workout_date'
    account = database.get(userAccount, event.recipient_user_id)
    settings = database.get(attendanceSetting, event.recipient_user_id)
    if account is None or settings is None:
        return 'settings_missing'
    weekdays = set(
        database.scalars(
            select(scheduleDay.day_of_week).where(scheduleDay.user_id == account.user_id)
        )
    )
    session = database.scalar(
        select(workoutSession)
        .options(noload(workoutSession.photos), noload(workoutSession.workout_sets))
        .where(
            workoutSession.user_id == account.user_id, workoutSession.workout_date == workout_date
        )
    )
    desired = build_workout_candidates(account, settings, weekdays, session, workout_date)
    scheduled_at = parse_notification_time(event.payload.get('scheduled_at'))
    if (event.payload.get('notification_kind'), scheduled_at) not in desired:
        return 'workout_schedule_or_session_changed'
    return None
