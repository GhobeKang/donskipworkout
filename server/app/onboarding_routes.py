from datetime import time

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select, update

from .database import (
    attendanceSetting,
    notificationPreference,
    scheduleDay,
    userAccount,
    userOnboarding,
    weeklyPromise,
)
from .presentation import local_today
from .schemas import onboardingData, onboardingDraft, onboardingUpdate
from .security import databaseDependency, userDependency, utc_now
from .sharing import monday_of, schedule_next_promise

router = APIRouter(prefix='/api/v1/onboarding', tags=['onboarding'])


def onboarding_output(onboarding):
    if onboarding is None:
        # Only accounts explicitly enrolled at signup need initial setup.
        return {'required': False, 'status': 'not_required'}
    return {
        'required': onboarding.status != 'completed',
        'status': onboarding.status,
        'current_step': onboarding.current_step,
        'revision': onboarding.revision,
        'draft': onboarding.draft,
    }


def lock_onboarding(database, user_id):
    # Same lock order as settings and daily actions; serialize different devices.
    account = database.scalar(
        select(userAccount).where(userAccount.user_id == user_id).with_for_update()
    )
    onboarding = database.scalar(
        select(userOnboarding).where(userOnboarding.user_id == user_id).with_for_update()
    )
    if onboarding is None:
        raise HTTPException(409, '초기 설정 대상 계정이 아닙니다.')
    return account, onboarding


def validate_revision(onboarding, revision):
    if onboarding.revision != revision:
        raise HTTPException(409, '다른 화면에서 초기 설정이 변경되었습니다. 다시 불러와 주세요.')


@router.get('', response_model=onboardingData)
def read_onboarding(user: userDependency, database: databaseDependency):
    return onboarding_output(database.get(userOnboarding, user.user_id))


@router.put('', response_model=onboardingData)
def save_onboarding(payload: onboardingUpdate, user: userDependency, database: databaseDependency):
    _, onboarding = lock_onboarding(database, user.user_id)
    if onboarding.status == 'completed':
        return onboarding_output(onboarding)
    validate_revision(onboarding, payload.revision)
    onboarding.draft = payload.draft.model_dump(mode='json')
    onboarding.current_step = payload.current_step
    onboarding.status = payload.status
    onboarding.revision += 1
    database.commit()
    return onboarding_output(onboarding)


@router.post('/complete', response_model=onboardingData)
def complete_onboarding(
    payload: onboardingUpdate, user: userDependency, database: databaseDependency,
):
    account, onboarding = lock_onboarding(database, user.user_id)
    # A repeated completion after a network timeout must not apply settings twice.
    if onboarding.status == 'completed':
        return onboarding_output(onboarding)
    validate_revision(onboarding, payload.revision)
    draft: onboardingDraft = payload.draft
    if draft.notification_choice == 'pending':
        raise HTTPException(422, '알림 사용 여부를 선택해 주세요.')
    settings = database.get(attendanceSetting, user.user_id)
    account.timezone = draft.timezone
    if account.body_weight_kg != draft.body_weight_kg:
        account.body_weight_kg = draft.body_weight_kg
        account.body_weight_recorded_at = utc_now() if draft.body_weight_kg is not None else None
    settings.workout_time = time.fromisoformat(draft.workout_time)
    for field_name in (
        'notification_workout_enabled', 'notification_free_workout_enabled',
        'notification_missed_enabled', 'notification_snooze_enabled',
    ):
        setattr(settings, field_name,
                draft.notification_choice == 'enabled' and getattr(draft, field_name))
    database.execute(delete(scheduleDay).where(scheduleDay.user_id == user.user_id))
    database.add_all(
        scheduleDay(user_id=user.user_id, day_of_week=day) for day in draft.schedule_days
    )
    database.execute(update(notificationPreference)
                     .where(notificationPreference.user_id == user.user_id)
                     .values(timezone=draft.timezone))
    today = local_today(draft.timezone)
    week_start = monday_of(today)
    promise = database.get(weeklyPromise, (user.user_id, week_start))
    if promise is None:
        database.add(weeklyPromise(
            user_id=user.user_id, effective_week=week_start,
            target_count=len(draft.schedule_days), baseline_date=today,
        ))
    else:
        promise.target_count = len(draft.schedule_days)
        promise.baseline_date = today
    schedule_next_promise(database, user.user_id, len(draft.schedule_days), today)
    onboarding.status = 'completed'
    onboarding.current_step = 4
    onboarding.completed_at = utc_now()
    onboarding.revision += 1
    # The live settings now own these values; don't retain a second body-weight copy.
    onboarding.draft = draft.model_copy(update={'body_weight_kg': None}).model_dump(mode='json')
    database.commit()
    return onboarding_output(onboarding)
