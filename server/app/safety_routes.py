import logging
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import EmailStr, Field, SecretStr, field_validator
from sqlalchemy import delete, func, select, update

from .account_deletion import clean_deleted_photos, delete_account_data
from .community_policy import community_policy_sections, community_policy_version
from .community_safety import (
    cancel_direct_notifications,
    hide_room,
    require_shared_user,
)
from .database import (
    authSession,
    challengeRoom,
    challengeRound,
    challengeRoundMember,
    challengeRulebook,
    coachingQuestion,
    coachingReply,
    contentReport,
    photoDeletionJob,
    pushDevice,
    userAccount,
    userBlock,
    userCredential,
)
from .schemas import requestModel
from .security import (
    clear_session_cookie,
    databaseDependency,
    dummy_password_hash,
    password_hasher,
    userDependency,
    utc_now,
)

router = APIRouter(prefix='/api/v1')
logger = logging.getLogger(__name__)


class policyAcceptance(requestModel):
    version: str = Field(min_length=1, max_length=32)


class accountDeletion(requestModel):
    password: SecretStr = Field(min_length=1, max_length=128)
    confirmation: Literal['DELETE']


class publicAccountDeletion(accountDeletion):
    email: EmailStr = Field(max_length=255)


class reportSubmission(requestModel):
    content_type: Literal['user', 'room', 'question', 'reply']
    content_id: str = Field(min_length=1, max_length=36)
    reason: Literal['harassment', 'sexual', 'hate', 'privacy', 'spam', 'dangerous', 'other']
    details: str = Field(default='', max_length=1000)

    @field_validator('details')
    @classmethod
    def validate_details(cls, value):
        if any(ord(character) < 32 and character not in '\n\r\t' for character in value):
            raise ValueError('Control characters are not allowed')
        return value.strip()


class reportResolution(requestModel):
    action: Literal['dismiss', 'remove_content', 'suspend_user']
    note: str = Field(min_length=1, max_length=1000)

    @field_validator('note')
    @classmethod
    def validate_note(cls, value):
        return reportSubmission.validate_details(value)


def current_moderator(request: Request, user: userDependency):
    allowed_uuids = {str(value) for value in request.app.state.settings.moderator_user_uuids}
    if user.user_uuid not in allowed_uuids:
        raise HTTPException(403, '신고 관리 권한이 없습니다.')
    return user


moderatorDependency = Annotated[userAccount, Depends(current_moderator)]


@router.get('/policies/community')
def read_community_policy():
    return {'version': community_policy_version, 'sections': community_policy_sections,
            'operator': 'sayudogu', 'contact_email': 'sayudogu@gmail.com'}


@router.put('/me/community-consent')
def accept_community_policy(payload: policyAcceptance, user: userDependency,
                            database: databaseDependency):
    if payload.version != community_policy_version:
        raise HTTPException(409, '최신 이용약관을 확인하고 동의해 주세요.')
    account = database.scalar(select(userAccount).where(
        userAccount.user_id == user.user_id,
    ).with_for_update())
    account.community_policy_version = community_policy_version
    account.community_policy_accepted_at = utc_now()
    database.commit()
    return {'version': community_policy_version}


@router.get('/safety/status')
def read_safety_status(request: Request, user: userDependency):
    return {'is_moderator': user.user_uuid in {
        str(value) for value in request.app.state.settings.moderator_user_uuids
    }, 'community_policy_version': community_policy_version,
        'accepted_policy_version': user.community_policy_version}


@router.delete('/me/account')
def delete_own_account(payload: accountDeletion, request: Request, response: Response,
                       user: userDependency, database: databaseDependency):
    credential = database.get(userCredential, user.user_id)
    if not credential or not password_hasher.verify(
        payload.password.get_secret_value(), credential.password_hash,
    ):
        raise HTTPException(422, '계정 삭제를 위해 현재 비밀번호를 확인해 주세요.')
    delete_account_data(database, user)
    clear_session_cookie(response, request)
    # The durable queue survives process crashes and filesystem failures after the DB commit.
    try:
        clean_deleted_photos(request.app.state.session_factory,
                             request.app.state.settings.photo_storage_dir)
    except Exception as error:
        logger.error('account_photo_cleanup_queued error_type=%s', type(error).__name__)
    return {'deleted': True, 'photo_cleanup': 'queued_or_completed'}


@router.post('/auth/delete-account')
def delete_account_with_credentials(payload: publicAccountDeletion, request: Request,
                                    response: Response, database: databaseDependency):
    # Also available to suspended accounts; it never grants access to other app features.
    user = database.scalar(select(userAccount).where(
        userAccount.email == str(payload.email).lower(),
    ))
    credential = database.get(userCredential, user.user_id) if user else None
    valid_password = password_hasher.verify(payload.password.get_secret_value(),
                                           credential.password_hash if credential else dummy_password_hash)
    if user is None or credential is None or not valid_password:
        raise HTTPException(422, '이메일 또는 비밀번호를 확인해 주세요.')
    deleted_user_uuid = user.user_uuid
    delete_account_data(database, user)
    clear_session_cookie(response, request)
    return {'deleted': True, 'deleted_user_uuid': deleted_user_uuid,
            'photo_cleanup': 'queued_or_completed'}


@router.get('/safety/blocks')
def list_user_blocks(user: userDependency, database: databaseDependency):
    rows = database.execute(select(userBlock, userAccount).join(
        userAccount, userAccount.user_id == userBlock.blocked_user_id,
    ).where(userBlock.blocker_user_id == user.user_id)).all()
    return {'users': [{'user_uuid': account.user_uuid, 'display_name': account.display_name,
                       'created_at': block.created_at.isoformat() + 'Z'}
                      for block, account in rows]}


@router.put('/safety/blocks/{target_uuid}', status_code=204)
def block_user(target_uuid: UUID, user: userDependency, database: databaseDependency):
    target = require_shared_user(database, user.user_id, target_uuid)
    # Both send and block operations take these locks in the same order.
    database.scalars(select(userAccount).where(userAccount.user_id.in_(
        [user.user_id, target.user_id],
    )).order_by(userAccount.user_id).with_for_update()).all()
    if database.get(userBlock, (user.user_id, target.user_id)) is None:
        database.add(userBlock(blocker_user_id=user.user_id, blocked_user_id=target.user_id))
    cancel_direct_notifications(database, user.user_id, target.user_id)
    database.commit()


@router.delete('/safety/blocks/{target_uuid}', status_code=204)
def unblock_user(target_uuid: UUID, user: userDependency, database: databaseDependency):
    target = database.scalar(select(userAccount).where(userAccount.user_uuid == str(target_uuid)))
    if target is not None:
        database.execute(delete(userBlock).where(
            userBlock.blocker_user_id == user.user_id, userBlock.blocked_user_id == target.user_id,
        ))
        database.commit()


def report_target(database, user_id, content_type, content_id):
    missing = HTTPException(404, '신고할 콘텐츠를 찾을 수 없습니다.')
    if content_type == 'user':
        target = require_shared_user(database, user_id, content_id)
        return target.user_id, target.display_name or '', target
    if content_type == 'room':
        room = database.scalar(select(challengeRoom).where(challengeRoom.room_uuid == content_id))
        if room is None:
            raise missing
        current_round = database.scalar(select(challengeRound).join(
            challengeRoundMember, challengeRoundMember.round_id == challengeRound.round_id,
        ).where(challengeRound.room_id == room.room_id,
                challengeRoundMember.user_id == user_id)
            .order_by(challengeRound.round_number.desc()).limit(1))
        if current_round is None or room.host_user_id == user_id:
            raise missing
        rulebook = database.scalar(select(challengeRulebook).where(
            challengeRulebook.round_id == current_round.round_id,
        ).order_by(challengeRulebook.version.desc()).limit(1))
        snapshot = '\n'.join([room.name, room.description or '',
                              current_round.draft_rulebook.get('description') or '',
                              rulebook.description if rulebook and rulebook.description else ''])
        return room.host_user_id, snapshot, room
    reply = None
    if content_type == 'reply':
        if not content_id.isdecimal() or not 0 < int(content_id) <= 9223372036854775807:
            raise missing
        reply = database.get(coachingReply, int(content_id))
        question = database.get(coachingQuestion, reply.question_id) if reply else None
    else:
        question = database.scalar(select(coachingQuestion).where(
            coachingQuestion.question_uuid == content_id,
        ))
    if question is None or user_id not in {question.author_user_id, question.host_user_id}:
        raise missing
    target_id = reply.sender_user_id if reply else question.author_user_id
    if target_id == user_id:
        raise missing
    return target_id, (reply.body if reply else question.body), reply or question


@router.post('/safety/reports', status_code=201)
def submit_content_report(payload: reportSubmission, user: userDependency,
                           database: databaseDependency):
    target_id, snapshot, _ = report_target(
        database, user.user_id, payload.content_type, payload.content_id,
    )
    database.scalar(select(userAccount).where(
        userAccount.user_id == user.user_id,
    ).with_for_update())
    existing = database.scalar(select(contentReport).where(
        contentReport.reporter_user_id == user.user_id,
        contentReport.content_type == payload.content_type,
        contentReport.content_id == payload.content_id, contentReport.status == 'open',
    ))
    if existing:
        return {'report_uuid': existing.report_uuid, 'status': existing.status}
    from .community_safety import report_window_start

    recent_count = database.scalar(select(func.count()).select_from(contentReport).where(
        contentReport.reporter_user_id == user.user_id,
        contentReport.created_at >= report_window_start(),
    ))
    if recent_count >= 20:
        raise HTTPException(429, '하루 신고 가능 횟수를 초과했습니다. 나중에 다시 시도해 주세요.')
    report = contentReport(
        report_uuid=str(uuid4()), reporter_user_id=user.user_id, target_user_id=target_id,
        content_type=payload.content_type, content_id=payload.content_id, reason=payload.reason,
        details=payload.details.strip(), content_snapshot=snapshot[:2400], status='open',
    )
    database.add(report)
    database.commit()
    return {'report_uuid': report.report_uuid, 'status': report.status}


@router.get('/moderation/reports')
def list_content_reports(moderator: moderatorDependency, database: databaseDependency,
                         status: Literal['open', 'resolved'] = 'open',
                         before_id: int | None = Query(default=None, gt=0)):
    query = select(contentReport).where(contentReport.status == status)
    if before_id is not None:
        query = query.where(contentReport.report_id < before_id)
    rows = database.scalars(query.order_by(contentReport.report_id.desc()).limit(31)).all()
    pending_count = database.scalar(select(func.count()).select_from(photoDeletionJob).where(
        photoDeletionJob.status == 'pending',
    ))
    failed_count = database.scalar(select(func.count()).select_from(photoDeletionJob).where(
        photoDeletionJob.status == 'failed',
    ))
    return {'reports': [{
        'report_uuid': row.report_uuid, 'content_type': row.content_type, 'reason': row.reason,
        'details': row.details, 'content_snapshot': row.content_snapshot, 'status': row.status,
        'resolution': row.resolution, 'resolution_note': row.resolution_note,
        'created_at': row.created_at.isoformat() + 'Z',
    } for row in rows[:30]], 'next_cursor': rows[29].report_id if len(rows) > 30 else None,
        'photo_cleanup_pending': pending_count, 'photo_cleanup_failed': failed_count}


@router.post('/moderation/reports/{report_uuid}/resolve')
def resolve_content_report(report_uuid: UUID, payload: reportResolution,
                            moderator: moderatorDependency, database: databaseDependency):
    report = database.scalar(select(contentReport).where(
        contentReport.report_uuid == str(report_uuid),
    ).with_for_update())
    if report is None:
        raise HTTPException(404, '신고를 찾을 수 없습니다.')
    if report.status != 'open':
        raise HTTPException(409, '이미 처리된 신고입니다.')
    if not payload.note.strip():
        raise HTTPException(422, '처리 사유를 입력해 주세요.')
    if payload.action == 'suspend_user':
        if report.target_user_id is None or report.target_user_id == moderator.user_id:
            raise HTTPException(409, '이 계정은 이용 제한할 수 없습니다.')
        credential = database.get(userCredential, report.target_user_id)
        if credential is None:
            raise HTTPException(404, '사용자를 찾을 수 없습니다.')
        credential.is_active = False
        database.execute(delete(authSession).where(
            authSession.user_id == report.target_user_id,
        ))
        database.execute(update(pushDevice).where(
            pushDevice.user_id == report.target_user_id,
        ).values(active=False))
    if payload.action in {'remove_content', 'suspend_user'}:
        if report.content_type == 'room':
            room = database.scalar(select(challengeRoom).where(
                challengeRoom.room_uuid == report.content_id,
            ))
            if room:
                hide_room(database, room)
        elif report.content_type == 'user':
            account = database.get(userAccount, report.target_user_id)
            if account:
                account.display_name = '운영 정책에 따라 숨긴 이름'
        elif report.content_type == 'question':
            question = database.scalar(select(coachingQuestion).where(
                coachingQuestion.question_uuid == report.content_id,
            ))
            if question:
                question.body = '운영 정책에 따라 삭제된 내용입니다.'
                question.is_removed = True
        else:
            reply = database.get(coachingReply, int(report.content_id))
            if reply:
                reply.body = '운영 정책에 따라 삭제된 내용입니다.'
                reply.is_removed = True
        report.content_snapshot = ''
    report.status = 'resolved'
    report.resolution = payload.action
    report.resolution_note = payload.note.strip()
    report.reviewed_by_user_id = moderator.user_id
    report.resolved_at = utc_now()
    database.commit()
    return {'status': report.status, 'resolution': report.resolution}


@router.post('/moderation/photo-cleanup/retry')
def retry_failed_photo_cleanup(moderator: moderatorDependency, database: databaseDependency):
    result = database.execute(update(photoDeletionJob).where(
        photoDeletionJob.status == 'failed',
    ).values(status='pending', attempt_count=0, last_error=None))
    database.commit()
    return {'requeued_count': result.rowcount}
