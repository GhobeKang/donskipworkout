from collections import defaultdict
from copy import deepcopy
from datetime import datetime, time, timedelta, timezone
from hashlib import sha256
from hmac import new as hmac_new
from math import floor
from secrets import token_urlsafe
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from .challenge_report import (
    build_round_growth_reports,
    capture_growth_plans,
    enrich_growth_report,
    growth_evidence_version,
    growth_method_version,
    team_growth_summary,
)
from .challenge_service import (
    accepted_checkins_for_round,
    advance_round_status,
    create_round_periods,
    finalize_round_if_due,
    round_progress,
)
from .community_policy import communityUserDependency
from .community_safety import (
    blocked_user_ids,
    filter_blocked_members,
    require_room_visible,
)
from .database import (
    challengeEvaluation,
    challengeInvitation,
    challengeInviteAttempt,
    challengePeriod,
    challengeRoom,
    challengeRound,
    challengeRoundMember,
    challengeRulebook,
    notificationEvent,
    notificationInbox,
    notificationOutbox,
    userAccount,
)
from .notification_service import create_room_news_events
from .schemas import challengeInviteJoin, challengeRoomCreate, challengeRulebookUpdate
from .security import databaseDependency, utc_now

router = APIRouter(prefix='/api/v1')
seoul_timezone = ZoneInfo('Asia/Seoul')
invite_code_alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def digest_invite(value: str) -> str:
    return sha256(value.encode('utf-8')).hexdigest()


def stable_room_invite_code(room_uuid: str, request: Request) -> str:
    settings = request.app.state.settings
    configured_secret = settings.challenge_invite_secret
    signing_secret = (
        configured_secret.get_secret_value()
        if configured_secret
        else settings.database_connection_url().password
    )
    if not signing_secret:
        raise HTTPException(503, '초대 코드를 생성할 수 없습니다.')
    digest = hmac_new(
        signing_secret.encode('utf-8'),
        f'challenge-room-invite:{room_uuid}'.encode('utf-8'),
        'sha256',
    ).digest()
    code = ''.join(invite_code_alphabet[byte & 31] for byte in digest[:8])
    return f'{code[:4]}-{code[4:]}'


def get_round_for_user(database, round_uuid: str, user_id: int):
    result = database.execute(
        select(challengeRound, challengeRoom, challengeRoundMember)
        .join(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .join(challengeRoundMember, challengeRoundMember.round_id == challengeRound.round_id)
        .where(
            challengeRound.round_uuid == round_uuid,
            challengeRoundMember.user_id == user_id,
            challengeRoom.status != 'cancelled',
        )
    ).first()
    if result is None:
        raise HTTPException(404, '방을 찾을 수 없습니다.')
    require_room_visible(database, user_id, result[1])
    return result


def require_host(room: challengeRoom, user_id: int):
    if room.host_user_id != user_id:
        raise HTTPException(403, '현재 방장만 변경할 수 있습니다.')


def lock_round(database, current_round: challengeRound):
    database.scalar(
        select(challengeRound)
        .where(challengeRound.round_id == current_round.round_id)
        .with_for_update()
    )
    database.refresh(current_round)


def latest_rulebook(database, round_id: int):
    return database.scalar(
        select(challengeRulebook)
        .where(challengeRulebook.round_id == round_id)
        .order_by(challengeRulebook.version.desc())
        .limit(1)
    )


def published_rulebook_matches_draft(current_round: challengeRound, rulebook: challengeRulebook):
    return all(
        rulebook.rulebook_json.get(key) == value
        for key, value in current_round.draft_rulebook.items() if not key.startswith('_')
    )


def room_member_output(member: challengeRoundMember, account: userAccount):
    return {
        'user_uuid': account.user_uuid,
        'display_name': account.display_name or '운동 사용자',
        'participant_status': member.participant_status,
        'consented': member.consented_at is not None,
    }


def room_can_be_deleted(rounds, now: datetime) -> bool:
    return bool(rounds) and all(
        current_round.status in {'draft', 'awaiting_consent', 'scheduled'}
        and (current_round.start_at is None or current_round.start_at > now)
        for current_round in rounds
    )


def round_output(database, room: challengeRoom, current_round: challengeRound, viewer_user_id):
    require_room_visible(database, viewer_user_id, room)
    members = database.execute(
        select(challengeRoundMember, userAccount)
        .join(userAccount, userAccount.user_id == challengeRoundMember.user_id)
        .where(challengeRoundMember.round_id == current_round.round_id)
        .order_by(challengeRoundMember.joined_at, challengeRoundMember.member_id)
    ).all()
    rulebook = latest_rulebook(database, current_round.round_id)
    room_rounds = database.scalars(
        select(challengeRound).where(challengeRound.room_id == room.room_id)
    ).all()
    host = database.get(userAccount, room.host_user_id) if room.host_user_id is not None else None
    return filter_blocked_members(database, viewer_user_id, {
        'room_uuid': room.room_uuid,
        'round_uuid': current_round.round_uuid,
        'room_name': room.name,
        'description': room.description,
        'member_limit': room.member_limit,
        'host_user_uuid': host.user_uuid if host else None,
        'host_vacant': host is None,
        'round_number': current_round.round_number,
        'status': current_round.status,
        'can_delete': room.status == 'open' and room_can_be_deleted(room_rounds, utc_now()),
        'start_at': current_round.start_at.isoformat() if current_round.start_at else None,
        'end_at': current_round.end_at.isoformat() if current_round.end_at else None,
        'rulebook_version': current_round.rulebook_version,
        'roster_version': current_round.roster_version,
        'member_count': len(members),
        'members': [room_member_output(member, account) for member, account in members],
        'rulebook': {
            'version': rulebook.version,
            **{key: value for key, value in rulebook.rulebook_json.items() if not key.startswith('_')},
        } if rulebook else {key: value for key, value in current_round.draft_rulebook.items() if not key.startswith('_')},
        'draft_rulebook': {key: value for key, value in current_round.draft_rulebook.items() if not key.startswith('_')},
    })


@router.get('/challenge-rooms')
def list_challenge_rooms(user: communityUserDependency, database: databaseDependency):
    blocked_ids = blocked_user_ids(database, user.user_id)
    rows = database.execute(
        select(challengeRound, challengeRoom)
        .join(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .join(challengeRoundMember, challengeRoundMember.round_id == challengeRound.round_id)
        .where(
            challengeRoundMember.user_id == user.user_id,
            challengeRoundMember.participant_status.not_in(['withdrawn', 'removed']),
            challengeRoom.status != 'cancelled',
        )
        .order_by(challengeRoom.created_at.desc(), challengeRound.round_number.desc())
    ).all()
    room_ids = {room.room_id for _, room in rows}
    room_rounds_by_id = defaultdict(list)
    if room_ids:
        round_states = database.execute(
            select(challengeRound.room_id, challengeRound.status, challengeRound.start_at)
            .where(challengeRound.room_id.in_(room_ids))
        ).all()
        for round_state in round_states:
            room_rounds_by_id[round_state.room_id].append(round_state)
    now = utc_now()
    return {
        'rooms': [
            {
                'room_uuid': room.room_uuid,
                'round_uuid': current_round.round_uuid,
                'name': room.name,
                'round_number': current_round.round_number,
                'status': current_round.status,
                'member_count': len(database.scalars(
                    select(challengeRoundMember.member_id).where(
                        challengeRoundMember.round_id == current_round.round_id,
                        challengeRoundMember.participant_status.not_in(['withdrawn', 'removed']),
                    )
                ).all()),
                'is_host': room.host_user_id == user.user_id,
                'can_delete': room.host_user_id == user.user_id
                and room.status == 'open'
                and room_can_be_deleted(room_rounds_by_id[room.room_id], now),
            }
            for current_round, room in rows if room.host_user_id not in blocked_ids
        ]
    }


@router.post('/challenge-rooms', status_code=201)
def create_challenge_room(
    payload: challengeRoomCreate,
    user: communityUserDependency,
    database: databaseDependency,
):
    room = challengeRoom(
        room_uuid=str(uuid4()),
        host_user_id=user.user_id,
        name=payload.name,
        description=payload.description.strip() if payload.description else None,
        member_limit=payload.member_limit,
    )
    current_round = challengeRound(
        round_uuid=str(uuid4()),
        round_number=1,
        status='draft',
        timezone='Asia/Seoul',
        roster_version=1,
        rulebook_version=0,
        draft_rulebook={
            'target_count': 3,
            'duration_days': 7,
            'verification_mode': 'photo_required',
            'start_date': None,
            'description': None,
        },
    )
    try:
        database.add(room)
        database.flush()
        current_round.room_id = room.room_id
        database.add(current_round)
        database.flush()
        database.add(
            challengeRoundMember(
                round_id=current_round.round_id,
                user_id=user.user_id,
                participant_status='joined_pending',
            )
        )
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(409, '방을 만들 수 없습니다. 다시 시도해 주세요.') from None
    return round_output(database, room, current_round, user.user_id)


@router.get('/challenge-rooms/{room_uuid}')
def read_challenge_room(room_uuid: str, user: communityUserDependency, database: databaseDependency):
    row = database.execute(
        select(challengeRound, challengeRoom)
        .join(challengeRoom, challengeRoom.room_id == challengeRound.room_id)
        .join(challengeRoundMember, challengeRoundMember.round_id == challengeRound.round_id)
        .where(
            challengeRoom.room_uuid == room_uuid,
            challengeRoundMember.user_id == user.user_id,
            challengeRoom.status != 'cancelled',
        )
        .order_by(challengeRound.round_number.desc())
        .limit(1)
    ).first()
    if row is None:
        raise HTTPException(404, '방을 찾을 수 없습니다.')
    current_round, room = row
    return round_output(database, room, current_round, user.user_id)


@router.delete('/challenge-rooms/{room_uuid}', status_code=204)
def delete_challenge_room(room_uuid: str, user: communityUserDependency, database: databaseDependency):
    room = database.scalar(
        select(challengeRoom).where(challengeRoom.room_uuid == room_uuid).with_for_update()
    )
    if room is None or room.status == 'cancelled':
        raise HTTPException(404, '방을 찾을 수 없습니다.')
    require_host(room, user.user_id)
    rounds = database.scalars(
        select(challengeRound)
        .where(challengeRound.room_id == room.room_id)
        .order_by(challengeRound.round_id)
        .with_for_update()
    ).all()
    now = utc_now()
    if room.status != 'open' or not room_can_be_deleted(rounds, now):
        raise HTTPException(409, '시작 전 대기 중인 방만 삭제할 수 있습니다.')
    round_ids = [current_round.round_id for current_round in rounds]
    database.execute(
        update(challengeInvitation)
        .where(challengeInvitation.round_id.in_(round_ids), challengeInvitation.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    database.execute(
        update(notificationOutbox)
        .where(
            notificationOutbox.event_id.in_(
                select(notificationEvent.event_id).where(notificationEvent.round_id.in_(round_ids))
            ),
            notificationOutbox.status == 'queued',
        )
        .values(status='cancelled', last_error='room_deleted')
    )
    recipient_ids = set(database.scalars(
        select(challengeRoundMember.user_id).where(
            challengeRoundMember.round_id.in_(round_ids),
            challengeRoundMember.user_id != user.user_id,
        )
    ).all())
    for recipient_id in recipient_ids:
        event = notificationEvent(
            event_uuid=str(uuid4()),
            event_key=f'room_deleted:{room.room_uuid}:{recipient_id}',
            round_id=None,
            recipient_user_id=recipient_id,
            sender_user_id=user.user_id,
            category='room_deleted',
            title='챌린지 방이 삭제되었습니다',
            body='방장이 시작 전에 삭제했습니다.',
            payload={'room_name': room.name},
            created_at=now,
        )
        database.add(event)
        database.flush()
        database.add(notificationInbox(event_id=event.event_id, user_id=recipient_id))
    for current_round in rounds:
        current_round.status = 'cancelled'
    room.status = 'cancelled'
    database.commit()
    return None


@router.post('/challenge-rounds/{round_uuid}/invites', status_code=201)
def create_challenge_invite(
    round_uuid: str,
    request: Request,
    user: communityUserDependency,
    database: databaseDependency,
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    require_host(room, user.user_id)
    lock_round(database, current_round)
    if current_round.status not in {'draft', 'awaiting_consent'}:
        raise HTTPException(409, '개시 예약 후에는 초대를 발급할 수 없습니다.')
    now = utc_now()
    invite_code = stable_room_invite_code(room.room_uuid, request)
    invite_code_hash = digest_invite(invite_code.replace('-', ''))
    active_invitation = database.scalar(
        select(challengeInvitation)
        .where(
            challengeInvitation.round_id == current_round.round_id,
            challengeInvitation.revoked_at.is_(None),
            challengeInvitation.expires_at > now,
        )
        .with_for_update()
    )
    if active_invitation and active_invitation.code_hash == invite_code_hash:
        return {
            'code': invite_code,
            'invite_path': None,
            'expires_at': active_invitation.expires_at.isoformat(),
            'reused': True,
        }
    if active_invitation:
        database.delete(active_invitation)
        database.flush()

    invite_token = token_urlsafe(32)
    expires_at = now + timedelta(days=7)
    stored_invitation = database.scalar(
        select(challengeInvitation).where(
            challengeInvitation.code_hash == invite_code_hash
        ).with_for_update()
    )
    if stored_invitation and stored_invitation.round_id != current_round.round_id:
        raise HTTPException(503, '초대 코드를 생성할 수 없습니다.')
    if stored_invitation:
        stored_invitation.token_hash = digest_invite(invite_token)
        stored_invitation.expires_at = expires_at
        stored_invitation.revoked_at = None
        stored_invitation.created_at = now
    else:
        database.add(
            challengeInvitation(
                round_id=current_round.round_id,
                token_hash=digest_invite(invite_token),
                code_hash=invite_code_hash,
                expires_at=expires_at,
                created_at=now,
            )
        )
    try:
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(503, '초대 발급에 실패했습니다. 다시 시도해 주세요.') from None
    return {
        'code': invite_code,
        'invite_path': f'/?invite={invite_token}',
        'expires_at': expires_at.isoformat(),
        'reused': False,
    }


@router.post('/challenge-invites/join')
def join_challenge_by_invite(
    payload: challengeInviteJoin,
    request: Request,
    user: communityUserDependency,
    database: databaseDependency,
):
    now = utc_now()
    database.scalar(
        select(userAccount).where(userAccount.user_id == user.user_id).with_for_update()
    )
    remote_address = request.client.host if request.client else 'unknown'
    address_hash = digest_invite(remote_address)
    window_start = now - timedelta(minutes=1)
    database.execute(
        delete(challengeInviteAttempt).where(challengeInviteAttempt.created_at < window_start)
    )
    database.add(
        challengeInviteAttempt(
            user_id=user.user_id,
            remote_address_hash=address_hash,
            created_at=now,
        )
    )
    database.flush()
    recent_attempts = database.scalars(
        select(challengeInviteAttempt.attempt_id).where(
            challengeInviteAttempt.created_at >= window_start,
            (challengeInviteAttempt.user_id == user.user_id)
            | (challengeInviteAttempt.remote_address_hash == address_hash),
        )
    ).all()
    if len(recent_attempts) > 5:
        database.commit()
        raise HTTPException(429, '초대 코드 입력 횟수가 많습니다. 1분 후 다시 시도해 주세요.')

    normalized_code = payload.code.replace('-', '').upper() if payload.code else ''
    credential_field = (
        challengeInvitation.token_hash if payload.token else challengeInvitation.code_hash
    )
    invite_credential = payload.token or normalized_code
    invitation = database.scalar(
        select(challengeInvitation).where(
            credential_field == digest_invite(invite_credential),
            challengeInvitation.revoked_at.is_(None),
            challengeInvitation.expires_at > now,
        )
    )
    if invitation is None:
        database.commit()
        raise HTTPException(404, '사용할 수 없는 초대 코드입니다.')
    current_round = database.get(challengeRound, invitation.round_id)
    room = database.get(challengeRoom, current_round.room_id)
    lock_round(database, current_round)
    database.refresh(room)
    invitation = database.scalar(
        select(challengeInvitation).where(
            challengeInvitation.invitation_id == invitation.invitation_id,
            challengeInvitation.revoked_at.is_(None),
            challengeInvitation.expires_at > now,
        )
    )
    if invitation is None or room.status == 'cancelled':
        database.commit()
        raise HTTPException(404, '사용할 수 없는 초대 코드입니다.')
    require_room_visible(database, user.user_id, room)
    if room.host_user_id is None:
        raise HTTPException(409, '방장이 없는 챌린지에는 참여할 수 없습니다.')
    if current_round.status not in {'draft', 'awaiting_consent'}:
        database.commit()
        raise HTTPException(409, '이미 모집이 끝난 방입니다.')
    member = database.scalar(
        select(challengeRoundMember).where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.user_id == user.user_id,
        )
    )
    if member is None or member.participant_status == 'withdrawn':
        member_count = len(database.scalars(
            select(challengeRoundMember.member_id).where(
                challengeRoundMember.round_id == current_round.round_id,
                challengeRoundMember.participant_status.not_in(['withdrawn', 'removed']),
            )
        ).all())
        if member_count >= room.member_limit:
            database.commit()
            raise HTTPException(409, '방 정원이 가득 찼습니다.')
        if member is None:
            member = challengeRoundMember(
                round_id=current_round.round_id,
                user_id=user.user_id,
                participant_status='joined_pending',
            )
            database.add(member)
        else:
            member.participant_status = 'joined_pending'
            member.withdrawn_at = None
        current_round.roster_version += 1
        for current_member in database.scalars(
            select(challengeRoundMember).where(challengeRoundMember.round_id == current_round.round_id)
        ):
            current_member.consented_rulebook_version = None
            current_member.consented_roster_version = None
            current_member.consented_at = None
        current_round.status = 'awaiting_consent'
    try:
        database.commit()
    except IntegrityError:
        database.rollback()
        raise HTTPException(409, '이미 이 초대에 참여했거나 방 정원이 가득 찼습니다.') from None
    return round_output(database, room, current_round, user.user_id)


@router.put('/challenge-rounds/{round_uuid}/rulebook')
def update_challenge_rulebook(
    round_uuid: str,
    payload: challengeRulebookUpdate,
    user: communityUserDependency,
    database: databaseDependency,
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    require_host(room, user.user_id)
    lock_round(database, current_round)
    if current_round.status not in {'draft', 'awaiting_consent'}:
        raise HTTPException(409, '개시 예약 후에는 룰북을 수정할 수 없습니다.')
    latest = latest_rulebook(database, current_round.round_id)
    if payload.expected_version != current_round.rulebook_version:
        raise HTTPException(409, '룰북 버전이 바뀌었습니다. 최신 내용을 다시 불러와 주세요.')
    draft = payload.model_dump(mode='json', exclude={'expected_version'})
    if draft != current_round.draft_rulebook:
        current_round.draft_rulebook = draft
        current_round.status = 'draft' if latest is None else 'awaiting_consent'
        for member in database.scalars(
            select(challengeRoundMember).where(challengeRoundMember.round_id == current_round.round_id)
        ):
            member.consented_rulebook_version = None
            member.consented_roster_version = None
            member.consented_at = None
    database.commit()
    return round_output(database, room, current_round, user.user_id)


@router.post('/challenge-rounds/{round_uuid}/publish')
def publish_challenge_rulebook(
    round_uuid: str,
    user: communityUserDependency,
    database: databaseDependency,
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    require_host(room, user.user_id)
    lock_round(database, current_round)
    if current_round.status not in {'draft', 'awaiting_consent'}:
        raise HTTPException(409, '현재 회차는 룰북을 게시할 수 없습니다.')
    draft = current_round.draft_rulebook or {}
    start_date_value = draft.get('start_date')
    if not start_date_value:
        raise HTTPException(422, '룰북에 시작 날짜를 정해 주세요.')
    start_date = datetime.fromisoformat(start_date_value).date()
    seoul_today = datetime.now(seoul_timezone).date()
    if start_date < seoul_today + timedelta(days=1):
        raise HTTPException(422, '시작 날짜는 내일부터 선택할 수 있습니다.')
    latest = latest_rulebook(database, current_round.round_id)
    now = utc_now()
    if latest and latest.published_at > now - timedelta(minutes=5):
        raise HTTPException(429, '룰북 게시 후 5분 동안은 다시 게시할 수 없습니다.')
    version = current_round.rulebook_version + 1
    rulebook_json = {**draft, 'timezone': 'Asia/Seoul', 'start_date': start_date.isoformat()}
    current_round.rulebook_version = version
    current_round.status = 'awaiting_consent'
    for member in database.scalars(
        select(challengeRoundMember).where(challengeRoundMember.round_id == current_round.round_id)
    ):
        member.consented_rulebook_version = None
        member.consented_roster_version = None
        member.consented_at = None
        member.participant_status = 'joined_pending'
    database.add(
        challengeRulebook(
            round_id=current_round.round_id,
            version=version,
            target_count=draft['target_count'],
            duration_days=draft['duration_days'],
            verification_mode=draft['verification_mode'],
            description=draft.get('description'),
            rulebook_json=rulebook_json,
            published_at=now,
        )
    )
    notification_delivery = create_room_news_events(
        database, current_round, room, user.user_id, version, now
    )
    database.commit()
    response = round_output(database, room, current_round, user.user_id)
    response['notification_delivery'] = notification_delivery
    return response


@router.post('/challenge-rounds/{round_uuid}/consents')
def consent_to_challenge(
    round_uuid: str,
    user: communityUserDependency,
    database: databaseDependency,
):
    current_round, room, member = get_round_for_user(database, round_uuid, user.user_id)
    lock_round(database, current_round)
    member = database.scalar(
        select(challengeRoundMember).where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.user_id == user.user_id,
        ).with_for_update()
    )
    if member.consented_rulebook_version == current_round.rulebook_version and member.consented_roster_version == current_round.roster_version:
        return round_output(database, room, current_round, user.user_id)
    latest = latest_rulebook(database, current_round.round_id)
    if latest is None or current_round.status not in {'awaiting_consent', 'draft'}:
        raise HTTPException(409, '동의할 수 있는 게시된 룰북이 없습니다.')
    if not published_rulebook_matches_draft(current_round, latest):
        raise HTTPException(409, '방장이 수정한 최신 룰북이 아직 게시되지 않았습니다.')
    now = utc_now()
    member.consented_rulebook_version = latest.version
    member.consented_roster_version = current_round.roster_version
    member.consented_at = now
    member.participant_status = 'consented'
    database.commit()
    return round_output(database, room, current_round, user.user_id)


@router.post('/challenge-rounds/{round_uuid}/start')
def schedule_challenge_start(
    round_uuid: str,
    user: communityUserDependency,
    database: databaseDependency,
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    require_host(room, user.user_id)
    lock_round(database, current_round)
    if current_round.status not in {'awaiting_consent', 'draft'}:
        raise HTTPException(409, '이 회차는 시작 예약 상태로 바꿀 수 없습니다.')
    latest = latest_rulebook(database, current_round.round_id)
    if latest is None:
        raise HTTPException(409, '먼저 룰북을 게시해 주세요.')
    if not published_rulebook_matches_draft(current_round, latest):
        raise HTTPException(409, '수정된 룰북을 게시하고 전원의 동의를 다시 받아야 합니다.')
    participants = database.scalars(
        select(challengeRoundMember).where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.participant_status.not_in(['withdrawn', 'removed']),
        )
    ).all()
    if not 2 <= len(participants) <= room.member_limit:
        raise HTTPException(409, '시작하려면 2명 이상이 필요합니다.')
    if any(
        member.consented_rulebook_version != latest.version
        or member.consented_roster_version != current_round.roster_version
        for member in participants
    ):
        raise HTTPException(409, '모든 참가자가 최신 룰북과 명단에 동의해야 합니다.')
    start_date = datetime.fromisoformat(latest.rulebook_json['start_date']).date()
    local_start = datetime.combine(start_date, time.min, tzinfo=seoul_timezone)
    start_at = local_start.astimezone(timezone.utc).replace(tzinfo=None)
    if start_at <= utc_now() + timedelta(hours=1):
        raise HTTPException(422, '시작은 현재 시각보다 1시간 이상 뒤여야 합니다.')
    end_at = start_at + timedelta(days=latest.duration_days)

    member_ids = [member.user_id for member in participants]
    database.scalars(
        select(userAccount)
        .where(userAccount.user_id.in_(sorted(member_ids)))
        .order_by(userAccount.user_id)
        .with_for_update()
    ).all()
    other_rounds = database.execute(
        select(challengeRoundMember.user_id, challengeRound)
        .join(challengeRound, challengeRound.round_id == challengeRoundMember.round_id)
        .where(
            challengeRoundMember.user_id.in_(member_ids),
            challengeRound.round_id != current_round.round_id,
            challengeRound.status.in_(['scheduled', 'active']),
        )
        .with_for_update()
    ).all()
    participation_counts = {member_id: 1 for member_id in member_ids}
    for member_id, other_round in other_rounds:
        participation_counts[member_id] += 1
        if other_round.start_at and other_round.end_at and start_at < other_round.end_at and end_at > other_round.start_at:
            raise HTTPException(409, '참가자의 다른 회차와 운동 기간이 겹칩니다.')
    if any(count > 3 for count in participation_counts.values()):
        raise HTTPException(409, '참가자는 동시에 최대 3개 회차에 참여할 수 있습니다.')

    capture_growth_plans(database, current_round, member_ids, utc_now())
    current_round.start_at = start_at
    current_round.end_at = end_at
    current_round.settlement_end_at = end_at + timedelta(hours=24)
    current_round.status = 'scheduled'
    database.execute(delete(challengePeriod).where(challengePeriod.round_id == current_round.round_id))
    create_round_periods(database, current_round, start_at, latest.duration_days, latest.target_count)
    database.execute(
        delete(challengeInvitation).where(challengeInvitation.round_id == current_round.round_id)
    )
    database.commit()
    return round_output(database, room, current_round, user.user_id)


@router.delete('/challenge-rounds/{round_uuid}/consents/me', status_code=204)
def withdraw_challenge_consent(round_uuid: str, user: communityUserDependency, database: databaseDependency):
    current_round, _, member = get_round_for_user(database, round_uuid, user.user_id)
    lock_round(database, current_round)
    member = database.scalar(
        select(challengeRoundMember).where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.user_id == user.user_id,
        ).with_for_update()
    )
    if current_round.status == 'scheduled':
        current_round.status = 'awaiting_consent'
        current_round.start_at = None
        current_round.end_at = None
        current_round.settlement_end_at = None
        database.execute(delete(challengePeriod).where(challengePeriod.round_id == current_round.round_id))
    elif current_round.status not in {'draft', 'awaiting_consent'}:
        raise HTTPException(409, '시작 전 동의만 철회할 수 있습니다.')
    current_round.roster_version += 1
    member.participant_status = 'joined_pending'
    member.consented_rulebook_version = None
    member.consented_roster_version = None
    member.consented_at = None
    for current_member in database.scalars(
        select(challengeRoundMember).where(challengeRoundMember.round_id == current_round.round_id)
    ):
        current_member.consented_rulebook_version = None
        current_member.consented_roster_version = None
        current_member.consented_at = None
    database.commit()
    return None


def public_periods(database, periods):
    result = []
    for period in periods:
        period_result = {**period, 'members': []}
        for member_result in period.get('members', []):
            public_member = {**member_result}
            account = database.get(userAccount, public_member.pop('user_id'))
            public_member['user_uuid'] = account.user_uuid if account else None
            public_member['display_name'] = account.display_name if account else '참가자'
            period_result['members'].append(public_member)
        result.append(period_result)
    return result


def public_evaluation(database, evaluation: dict, viewer_user_id):
    result = deepcopy(evaluation)
    result.pop('growth_reports', None)
    result.pop('growth_report_history', None)
    result.pop('growth_snapshot_origin', None)
    if any(
        'accepted_checkins' not in member_result
        for period in result.get('periods', [])
        for member_result in period.get('members', [])
    ):
        current_round = database.scalar(
            select(challengeRound).where(challengeRound.round_uuid == result['round_uuid'])
        )
        if current_round is not None:
            checkins_by_member = accepted_checkins_for_round(database, current_round.round_id)
            for period in result.get('periods', []):
                for member_result in period.get('members', []):
                    member_result['accepted_checkins'] = checkins_by_member.get(
                        (period['period_index'], member_result['user_id']), []
                    )
    result['periods'] = public_periods(database, result.get('periods', []))
    for member_result in result.get('members', []):
        account = database.get(userAccount, member_result.pop('user_id'))
        member_result['user_uuid'] = account.user_uuid if account else None
        member_result['display_name'] = account.display_name if account else '참가자'
    return filter_blocked_members(database, viewer_user_id, result)


@router.get('/challenge-rounds/{round_uuid}/progress')
def read_challenge_progress(round_uuid: str, user: communityUserDependency, database: databaseDependency):
    current_round, _, _ = get_round_for_user(database, round_uuid, user.user_id)
    now = utc_now()
    advance_round_status(database, current_round, now)
    snapshot = finalize_round_if_due(database, current_round, now)
    if snapshot is not None:
        database.commit()
        return public_evaluation(database, snapshot, user.user_id)
    periods = round_progress(database, current_round, now)
    target_total = sum(period['target_count'] * len(period['members']) for period in periods)
    credited_total = sum(
        member_result['credited_count']
        for period in periods
        for member_result in period['members']
    )
    database.commit()
    periods = filter_blocked_members(database, user.user_id, public_periods(database, periods))
    return {
        'round_uuid': current_round.round_uuid,
        'status': current_round.status,
        'updated_at': now.isoformat() + 'Z',
        'evaluation_status': 'settling' if current_round.status == 'settling' else 'in_progress',
        'rulebook_version': current_round.rulebook_version,
        'roster_version': current_round.roster_version,
        'credited_count': credited_total,
        'target_count': target_total,
        'progress_percent': floor(100 * credited_total / target_total + 0.5) if target_total else 0,
        'periods': periods,
    }


@router.get('/challenge-rounds/{round_uuid}/results')
def read_challenge_results(round_uuid: str, user: communityUserDependency, database: databaseDependency):
    current_round, _, _ = get_round_for_user(database, round_uuid, user.user_id)
    now = utc_now()
    advance_round_status(database, current_round, now)
    snapshot = finalize_round_if_due(database, current_round, now)
    if snapshot is not None:
        database.commit()
        return public_evaluation(database, snapshot, user.user_id)



def host_growth_reports(database, current_round, room, user_id, now):
    if room.host_user_id != user_id:
        raise HTTPException(403, '현재 방장만 팀원 성장 리포트를 볼 수 있습니다.')
    if current_round.end_at is None or now < current_round.end_at or current_round.status not in {
        'active', 'settling', 'completed', 'review_required',
    }:
        raise HTTPException(409, '챌린지 기간 종료 후 성장 리포트를 확인할 수 있습니다.')
    lock_round(database, current_round)
    advance_round_status(database, current_round, now)
    snapshot = finalize_round_if_due(database, current_round, now)
    report_state = 'finalized' if current_round.status == 'completed' else 'provisional'
    snapshot_origin = 'settlement' if report_state == 'finalized' else 'live'
    if snapshot is not None:
        reports = snapshot.get('growth_reports')
        outdated_reports = reports is not None and any(
            report.get('method_version') != growth_method_version for report in reports.values()
        )
        if reports is None or outdated_reports:
            updated_reports = build_round_growth_reports(database, current_round, now)
            evaluation = database.scalar(select(challengeEvaluation).where(
                challengeEvaluation.round_id == current_round.round_id,
            ).order_by(challengeEvaluation.evaluation_version.desc()).limit(1).with_for_update())
            if evaluation is not None:
                history = deepcopy(snapshot.get('growth_report_history', {}))
                for user_id, previous_report in (reports or {}).items():
                    previous_version = previous_report.get('method_version', 'legacy')
                    history.setdefault(previous_version, {})[user_id] = previous_report
                # A criteria change permits one explicit recalculation; the prior
                # report remains in private history. Subsequent reads are frozen.
                snapshot = {
                    **snapshot, 'growth_reports': updated_reports,
                    'growth_report_history': history,
                    'growth_snapshot_origin': 'criteria_recalculation' if outdated_reports
                    else 'historical_backfill',
                }
                evaluation.result_json = snapshot
            reports = updated_reports
        snapshot_origin = snapshot.get('growth_snapshot_origin', 'settlement')
    else:
        reports = build_round_growth_reports(database, current_round, now)
    if any('workout_time' not in report for report in reports.values()):
        time_reports = build_round_growth_reports(database, current_round, now)
        # Backfill timer evidence without changing previously finalized scores.
        reports = {
            member_id: {**report, 'workout_time': time_reports.get(member_id, {}).get('workout_time')}
            for member_id, report in reports.items()
        }
        if snapshot is not None:
            evaluation = database.scalar(select(challengeEvaluation).where(
                challengeEvaluation.round_id == current_round.round_id,
            ).order_by(challengeEvaluation.evaluation_version.desc()).limit(1).with_for_update())
            if evaluation is not None:
                evaluation.result_json = {**snapshot, 'growth_reports': reports}
    hidden_member_ids = {str(member_id) for member_id in blocked_user_ids(database, user_id)}
    current_names = {str(account_id): display_name for account_id, display_name in database.execute(
        select(userAccount.user_id, userAccount.display_name).where(
            userAccount.user_id.in_([int(member_id) for member_id in reports if member_id.isdecimal()]),
        )
    )}
    reports = {member_id: {**enrich_growth_report(report),
                          'display_name': current_names.get(member_id) or '참가자'}
               for member_id, report in reports.items() if member_id not in hidden_member_ids}
    return reports, {
        'round_uuid': current_round.round_uuid,
        'report_state': report_state,
        'method_version': growth_method_version,
        'evidence_method_version': growth_evidence_version,
        'snapshot_origin': snapshot_origin,
        'finalized_at': snapshot.get('finalized_at') if snapshot else None,
    }


@router.get('/challenge-rounds/{round_uuid}/member-reports')
def read_challenge_member_reports(
    round_uuid: str, response: Response, user: communityUserDependency, database: databaseDependency,
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    reports, metadata = host_growth_reports(database, current_round, room, user.user_id, utc_now())
    summary_fields = (
        'user_uuid', 'display_name', 'participant_status', 'total_score', 'available_points',
        'earned_points', 'score_status', 'improved_exercise_count', 'computed_at',
        'growth_summary',
    )
    response.headers['Cache-Control'] = 'private, no-store'
    database.commit()
    return {**metadata, 'team_summary': team_growth_summary(reports), 'members': [
        {field: report[field] for field in summary_fields} for report in reports.values()
    ]}


@router.get('/challenge-rounds/{round_uuid}/member-reports/{member_uuid}')
def read_challenge_member_report(
    round_uuid: str, member_uuid: str, response: Response,
    user: communityUserDependency, database: databaseDependency,
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    reports, metadata = host_growth_reports(database, current_round, room, user.user_id, utc_now())
    report = next((item for item in reports.values() if item['user_uuid'] == member_uuid), None)
    if report is None:
        raise HTTPException(404, '이 회차의 참가자 리포트를 찾을 수 없습니다.')
    response.headers['Cache-Control'] = 'private, no-store'
    database.commit()
    return {**metadata, **report}


@router.post('/challenge-rounds/{round_uuid}/continuations', status_code=201)
def propose_challenge_continuation(
    round_uuid: str,
    user: communityUserDependency,
    database: databaseDependency,
):
    previous_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    require_host(room, user.user_id)
    lock_round(database, previous_round)
    if previous_round.status != 'completed':
        raise HTTPException(409, '결과가 확정된 회차에서만 다음 회차를 만들 수 있습니다.')
    next_round = database.scalar(
        select(challengeRound).where(
            challengeRound.previous_round_id == previous_round.round_id
        )
    )
    if next_round is not None:
        return round_output(database, room, next_round, user.user_id)
    previous_rulebook = latest_rulebook(database, previous_round.round_id)
    if previous_rulebook is None:
        raise HTTPException(409, '복사할 룰북이 없습니다.')
    returning_members = database.scalars(
        select(challengeRoundMember)
        .where(
            challengeRoundMember.round_id == previous_round.round_id,
            challengeRoundMember.participant_status.not_in(['withdrawn', 'removed', 'invited']),
        )
        .order_by(challengeRoundMember.joined_at, challengeRoundMember.member_id)
    ).all()
    if len(returning_members) > room.member_limit:
        raise HTTPException(409, '기존 참가자가 현재 방 정원을 초과합니다.')
    next_round = challengeRound(
        round_uuid=str(uuid4()),
        room_id=room.room_id,
        round_number=previous_round.round_number + 1,
        previous_round_id=previous_round.round_id,
        status='draft',
        timezone='Asia/Seoul',
        roster_version=1,
        rulebook_version=0,
        draft_rulebook={
            'target_count': previous_rulebook.target_count,
            'duration_days': previous_rulebook.duration_days,
            'verification_mode': previous_rulebook.verification_mode,
            'start_date': None,
            'description': previous_rulebook.description,
        },
    )
    room.status = 'open'
    database.add(next_round)
    try:
        database.flush()
        database.add_all(
            challengeRoundMember(
                round_id=next_round.round_id,
                user_id=member.user_id,
                participant_status='joined_pending',
            )
            for member in returning_members
        )
        database.commit()
    except IntegrityError:
        database.rollback()
        existing_round = database.scalar(
            select(challengeRound).where(
                challengeRound.previous_round_id == previous_round.round_id
            )
        )
        if existing_round is None:
            raise HTTPException(409, '다음 회차를 만들지 못했습니다. 최신 방 상태를 확인해 주세요.') from None
        room = database.get(challengeRoom, existing_round.room_id)
        return round_output(database, room, existing_round, user.user_id)
    return round_output(database, room, next_round, user.user_id)
