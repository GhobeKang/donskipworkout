import asyncio
import logging
from pathlib import Path

from sqlalchemy import delete, or_, select, update

from .database import (
    attendanceSetting,
    authSession,
    challengeCheckin,
    challengeEvaluation,
    challengeInvitation,
    challengeInviteAttempt,
    challengeRoom,
    challengeRound,
    challengeRoundMember,
    challengeRulebook,
    challengeVerificationEvent,
    coachingQuestion,
    coachingReply,
    contentReport,
    exerciseItem,
    notificationEvent,
    notificationInbox,
    notificationOutbox,
    notificationPreference,
    photoDeletionJob,
    pushDevice,
    scheduleDay,
    userAccount,
    userBlock,
    userCredential,
    userSharedExerciseProgress,
    weeklyPromise,
    workoutPhoto,
    workoutSession,
    workoutSet,
    workoutTimer,
    workoutTimerEvent,
    workoutTimerRevision,
    workoutTimerSegment,
)

logger = logging.getLogger(__name__)


def scrub_evaluation(value, user_id, user_uuid):
    """Remove individual entries, including all historical growth-report snapshots."""
    if isinstance(value, list):
        return [scrub_evaluation(item, user_id, user_uuid) for item in value if not (
            isinstance(item, dict)
            and (item.get('user_id') == user_id or item.get('user_uuid') == user_uuid)
        )]
    if isinstance(value, dict):
        return {
            key: scrub_evaluation(item, user_id, user_uuid)
            for key, item in value.items() if key not in {str(user_id), user_uuid}
        }
    return value


def delete_account_data(database, user):
    user_id, user_uuid = user.user_id, user.user_uuid
    # Account row locks serialize deletion with operations that insert FK-linked data.
    database.scalar(select(userAccount).where(userAccount.user_id == user_id).with_for_update())
    session_ids = select(workoutSession.session_id).where(workoutSession.user_id == user_id)
    photos = database.scalars(select(workoutPhoto).where(
        workoutPhoto.session_id.in_(session_ids),
    )).all()
    for photo in photos:
        for storage_key in {photo.storage_key, photo.original_storage_key} - {None}:
            if not database.scalar(select(photoDeletionJob.job_id).where(
                photoDeletionJob.storage_key == storage_key,
            )):
                database.add(photoDeletionJob(storage_key=storage_key))

    affected_round_ids = set(database.scalars(select(challengeRoundMember.round_id).where(
        challengeRoundMember.user_id == user_id,
    )))
    hosted_rooms = database.scalars(select(challengeRoom).where(
        challengeRoom.host_user_id == user_id,
    ).with_for_update()).all()
    hosted_round_ids = set()
    for room in hosted_rooms:
        room.host_user_id = None
        room.name = '방장이 탈퇴한 챌린지'
        room.description = None
        for current_round in database.scalars(select(challengeRound).where(
            challengeRound.room_id == room.room_id,
        ).with_for_update()):
            affected_round_ids.add(current_round.round_id)
            hosted_round_ids.add(current_round.round_id)
            current_round.draft_rulebook = {
                key: item for key, item in current_round.draft_rulebook.items()
                if key != 'description' and not key.startswith('_')
            }
            if current_round.status in {'draft', 'awaiting_consent', 'scheduled'}:
                current_round.status = 'cancelled'
            database.execute(delete(challengeInvitation).where(
                challengeInvitation.round_id == current_round.round_id,
            ))
            for rulebook in database.scalars(select(challengeRulebook).where(
                challengeRulebook.round_id == current_round.round_id,
            )):
                rulebook.description = None
                rulebook.rulebook_json = {
                    key: item for key, item in rulebook.rulebook_json.items() if key != 'description'
                }

    for evaluation in database.scalars(select(challengeEvaluation).where(
        challengeEvaluation.round_id.in_(affected_round_ids),
    ).with_for_update()):
        evaluation.result_json = scrub_evaluation(evaluation.result_json, user_id, user_uuid)
    # Internal growth plans may contain another copy of a user's exercise history.
    for current_round in database.scalars(select(challengeRound).where(
        challengeRound.round_id.in_(affected_round_ids),
    ).with_for_update()):
        current_round.draft_rulebook = scrub_evaluation(
            current_round.draft_rulebook, user_id, user_uuid,
        )

    question_ids = select(coachingQuestion.question_id).where(or_(
        coachingQuestion.author_user_id == user_id, coachingQuestion.host_user_id == user_id,
    ))
    database.execute(delete(coachingReply).where(or_(
        coachingReply.question_id.in_(question_ids), coachingReply.sender_user_id == user_id,
    )))
    database.execute(delete(coachingQuestion).where(coachingQuestion.question_id.in_(question_ids)))
    # Events originating from the deleted account can contain user-authored room names.
    event_ids = select(notificationEvent.event_id).where(or_(
        notificationEvent.recipient_user_id == user_id, notificationEvent.sender_user_id == user_id,
        notificationEvent.round_id.in_(hosted_round_ids),
    ))
    database.execute(delete(notificationOutbox).where(or_(
        notificationOutbox.event_id.in_(event_ids),
        notificationOutbox.device_id.in_(select(pushDevice.device_id).where(
            pushDevice.user_id == user_id,
        )),
    )))
    database.execute(delete(notificationInbox).where(or_(
        notificationInbox.event_id.in_(event_ids), notificationInbox.user_id == user_id,
    )))
    database.execute(delete(notificationEvent).where(notificationEvent.event_id.in_(event_ids)))
    database.execute(update(contentReport).where(
        contentReport.reviewed_by_user_id == user_id,
    ).values(reviewed_by_user_id=None))
    database.execute(delete(contentReport).where(or_(
        contentReport.reporter_user_id == user_id, contentReport.target_user_id == user_id,
    )))
    database.execute(delete(userBlock).where(or_(
        userBlock.blocker_user_id == user_id, userBlock.blocked_user_id == user_id,
    )))
    database.execute(delete(challengeCheckin).where(challengeCheckin.user_id == user_id))
    database.execute(delete(challengeVerificationEvent).where(
        challengeVerificationEvent.user_id == user_id,
    ))
    database.execute(delete(workoutSet).where(workoutSet.session_id.in_(session_ids)))
    database.execute(delete(workoutPhoto).where(workoutPhoto.session_id.in_(session_ids)))
    database.execute(delete(workoutSession).where(workoutSession.user_id == user_id))
    timer_ids = select(workoutTimer.timer_id).where(workoutTimer.user_id == user_id)
    database.execute(delete(workoutTimerRevision).where(or_(
        workoutTimerRevision.timer_id.in_(timer_ids),
        workoutTimerRevision.changed_by_user_id == user_id,
    )))
    for model in (workoutTimerEvent, workoutTimerSegment):
        database.execute(delete(model).where(model.timer_id.in_(timer_ids)))
    database.execute(delete(workoutTimer).where(workoutTimer.user_id == user_id))
    for model in (
        challengeRoundMember, challengeInviteAttempt, notificationPreference, pushDevice,
        exerciseItem, userSharedExerciseProgress, attendanceSetting, scheduleDay, weeklyPromise,
        authSession, userCredential,
    ):
        database.execute(delete(model).where(model.user_id == user_id))
    database.flush()
    database.execute(delete(userAccount).where(userAccount.user_id == user_id))
    database.commit()


def clean_deleted_photos(session_factory, storage_dir, batch_size=25):
    root_path = Path(storage_dir).resolve()
    completed_count = 0
    with session_factory() as database:
        jobs = database.scalars(select(photoDeletionJob).where(
            photoDeletionJob.status == 'pending', photoDeletionJob.attempt_count < 3,
        ).order_by(photoDeletionJob.job_id).limit(batch_size).with_for_update(skip_locked=True)).all()
        for job in jobs:
            job.attempt_count += 1
            try:
                file_path = (root_path / job.storage_key).resolve()
                if not file_path.is_relative_to(root_path) or file_path == root_path:
                    raise ValueError('invalid_storage_path')
                file_path.unlink(missing_ok=True)
                if file_path.parent != root_path and file_path.parent.exists():
                    try:
                        file_path.parent.rmdir()
                    except OSError:
                        pass  # Other files in a photo directory are separate queued jobs.
                database.delete(job)
                completed_count += 1
            except (OSError, ValueError) as error:
                job.last_error = type(error).__name__
                if job.attempt_count >= 3:
                    job.status = 'failed'
                logger.error('photo_cleanup_failed job_id=%s error_type=%s',
                             job.job_id, type(error).__name__)
        database.commit()
    return completed_count


async def run_photo_cleanup(session_factory, storage_dir):
    consecutive_failures = 0
    while consecutive_failures < 3:
        try:
            await asyncio.wait_for(asyncio.to_thread(
                clean_deleted_photos, session_factory, storage_dir,
            ), timeout=10)
            consecutive_failures = 0
        except Exception as error:
            consecutive_failures += 1
            logger.error('photo_cleanup_batch_failed error_type=%s', type(error).__name__)
            if consecutive_failures >= 3:
                logger.error('photo_cleanup_stopped_after_retry_limit restart_server_after_recovery')
                return
        await asyncio.sleep(30)
