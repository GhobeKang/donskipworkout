from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import select

from .challenge_routes import get_round_for_user, lock_round
from .database import coachingQuestion, coachingReply, userAccount
from .schemas import requestModel
from .security import databaseDependency, userDependency, utc_now

router = APIRouter(prefix='/api/v1/challenge-rounds')


class coachingMessageInput(requestModel):
    request_id: UUID
    body: str = Field(min_length=1, max_length=2000)

    @field_validator('body')
    @classmethod
    def validate_body(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(char) < 32 and char not in '\n\r\t' for char in value):
            raise ValueError('A nonempty message without control characters is required')
        return value


class coachingQuestionInput(coachingMessageInput):
    category: Literal['technique', 'muscle', 'coaching', 'request']


def question_scope(current_round, room, user_id):
    # Recipient is fixed at creation; a future host must not inherit private history.
    owner_filter = (
        coachingQuestion.host_user_id == user_id
        if room.host_user_id == user_id
        else coachingQuestion.author_user_id == user_id
    )
    return select(coachingQuestion).where(
        coachingQuestion.round_id == current_round.round_id, owner_filter,
    )


def require_writable(member, current_round):
    if member.participant_status in {'invited', 'removed', 'withdrawn'}:
        raise HTTPException(403, '현재 참가자만 메시지를 보낼 수 있습니다.')
    if current_round.status == 'cancelled':
        raise HTTPException(409, '취소된 회차에는 메시지를 보낼 수 없습니다.')


def question_output(database, question, *, include_body=False):
    author = database.get(userAccount, question.author_user_id)
    result = {
        'question_uuid': question.question_uuid,
        'author_name': author.display_name or '참가자',
        'category': question.category,
        'preview': question.body[:100],
        'awaiting_host': question.awaiting_host,
        'created_at': question.created_at.isoformat() + 'Z',
        'updated_at': question.updated_at.isoformat() + 'Z',
    }
    if include_body:
        result['body'] = question.body
    return result


@router.get('/{round_uuid}/questions')
def list_questions(
    round_uuid: str, user: userDependency, database: databaseDependency,
    before_id: int | None = Query(default=None, gt=0),
):
    current_round, room, _ = get_round_for_user(database, round_uuid, user.user_id)
    query = question_scope(current_round, room, user.user_id)
    if before_id is not None:
        query = query.where(coachingQuestion.question_id < before_id)
    questions = database.scalars(query.order_by(coachingQuestion.question_id.desc()).limit(21)).all()
    page = questions[:20]
    return {
        'questions': [question_output(database, question) for question in page],
        'next_cursor': page[-1].question_id if len(questions) > 20 else None,
    }


@router.post('/{round_uuid}/questions', status_code=201)
def create_question(
    round_uuid: str, payload: coachingQuestionInput,
    user: userDependency, database: databaseDependency,
):
    current_round, room, member = get_round_for_user(database, round_uuid, user.user_id)
    require_writable(member, current_round)
    if room.host_user_id == user.user_id:
        raise HTTPException(403, '참가자만 방장에게 질문을 남길 수 있습니다.')
    lock_round(database, current_round)
    existing = database.scalar(select(coachingQuestion).where(
        coachingQuestion.round_id == current_round.round_id,
        coachingQuestion.author_user_id == user.user_id,
        coachingQuestion.request_id == str(payload.request_id),
    ))
    if existing:
        return question_output(database, existing, include_body=True)
    now = utc_now()
    question = coachingQuestion(
        question_uuid=str(uuid4()), round_id=current_round.round_id,
        author_user_id=user.user_id, host_user_id=room.host_user_id,
        request_id=str(payload.request_id), category=payload.category, body=payload.body,
        awaiting_host=True, created_at=now, updated_at=now,
    )
    database.add(question)
    database.commit()
    return question_output(database, question, include_body=True)


@router.get('/{round_uuid}/questions/{question_uuid}')
def read_question(
    round_uuid: str, question_uuid: str, user: userDependency, database: databaseDependency,
    before_id: int | None = Query(default=None, gt=0),
):
    current_round, room, member = get_round_for_user(database, round_uuid, user.user_id)
    question = database.scalar(question_scope(current_round, room, user.user_id).where(
        coachingQuestion.question_uuid == question_uuid,
    ))
    if question is None:
        raise HTTPException(404, '질문을 찾을 수 없습니다.')
    query = select(coachingReply).where(coachingReply.question_id == question.question_id)
    if before_id is not None:
        query = query.where(coachingReply.reply_id < before_id)
    replies = database.scalars(query.order_by(coachingReply.reply_id.desc()).limit(51)).all()
    page = replies[:50]
    return {
        **question_output(database, question, include_body=True),
        'can_reply': member.participant_status not in {'invited', 'removed', 'withdrawn'}
        and current_round.status != 'cancelled' and room.host_user_id == question.host_user_id,
        'replies': [{
            'reply_id': reply.reply_id, 'body': reply.body,
            'is_host': reply.sender_user_id == question.host_user_id,
            'created_at': reply.created_at.isoformat() + 'Z',
        } for reply in reversed(page)],
        'next_cursor': page[-1].reply_id if len(replies) > 50 else None,
    }


@router.post('/{round_uuid}/questions/{question_uuid}/replies', status_code=201)
def reply_to_question(
    round_uuid: str, question_uuid: str, payload: coachingMessageInput,
    user: userDependency, database: databaseDependency,
):
    current_round, room, member = get_round_for_user(database, round_uuid, user.user_id)
    question = database.scalar(question_scope(current_round, room, user.user_id).where(
        coachingQuestion.question_uuid == question_uuid,
    ).with_for_update())
    if question is None:
        raise HTTPException(404, '질문을 찾을 수 없습니다.')
    require_writable(member, current_round)
    if room.host_user_id != question.host_user_id:
        raise HTTPException(409, '방장이 변경된 이전 질문은 조회만 가능합니다.')
    existing = database.scalar(select(coachingReply).where(
        coachingReply.question_id == question.question_id,
        coachingReply.sender_user_id == user.user_id,
        coachingReply.request_id == str(payload.request_id),
    ))
    if not existing:
        now = utc_now()
        database.add(coachingReply(
            question_id=question.question_id, sender_user_id=user.user_id,
            request_id=str(payload.request_id), body=payload.body, created_at=now,
        ))
        question.awaiting_host = user.user_id != question.host_user_id
        question.updated_at = now
        database.commit()
    return {'saved': True}
