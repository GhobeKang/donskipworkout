from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .database import authSession, get_database, userAccount, userCredential

password_hasher = PasswordHash.recommended()
dummy_password_hash = password_hasher.hash(token_urlsafe(32))


def database_dependency(request: Request):
    yield from get_database(request)


databaseDependency = Annotated[Session, Depends(database_dependency)]


def authentication_error():
    return HTTPException(
        401, '인증 정보가 유효하지 않습니다.', headers={'WWW-Authenticate': 'Session'}
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_session_id(session_id: str) -> str:
    return sha256(session_id.encode('utf-8')).hexdigest()


def session_cookie_name(request: Request) -> str:
    return request.app.state.settings.session_cookie_name


def current_session(
    request: Request,
    response: Response,
    database: databaseDependency,
) -> tuple[authSession, userAccount]:
    raw_session_id = request.cookies.get(session_cookie_name(request))
    if not raw_session_id or len(raw_session_id) > 128:
        raise authentication_error()

    stored_session = database.get(authSession, hash_session_id(raw_session_id))
    now = utc_now()
    if stored_session is None:
        raise authentication_error()
    if stored_session.expires_at <= now:
        database.delete(stored_session)
        database.commit()
        raise authentication_error()

    credential = database.get(userCredential, stored_session.user_id)
    user = database.get(userAccount, stored_session.user_id)
    if not credential or not credential.is_active or user is None:
        raise authentication_error()
    expires_in = request.app.state.settings.session_days * 86400
    stored_session.expires_at = now + timedelta(seconds=expires_in)
    database.commit()
    set_session_cookie(response, request, raw_session_id, expires_in)
    return stored_session, user


current_session_dependency = Annotated[tuple[authSession, userAccount], Depends(current_session)]


def current_user(session_data: current_session_dependency) -> userAccount:
    return session_data[1]


userDependency = Annotated[userAccount, Depends(current_user)]


def authentication_data(user: userAccount, expires_in: int) -> dict:
    return {
        'expires_in': expires_in,
        'user': {
            'user_uuid': user.user_uuid,
            'email': user.email,
            'display_name': user.display_name,
            'community_policy_version': user.community_policy_version,
        },
    }


def create_session(request: Request, database: Session, user: userAccount) -> tuple[str, int]:
    settings = request.app.state.settings
    expires_in = settings.session_days * 86400
    now = utc_now()
    raw_session_id = token_urlsafe(32)
    database.execute(delete(authSession).where(authSession.expires_at <= now))
    previous_session_id = request.cookies.get(session_cookie_name(request))
    if previous_session_id:
        previous_session = database.get(authSession, hash_session_id(previous_session_id))
        if previous_session is not None:
            database.delete(previous_session)
    database.add(
        authSession(
            session_hash=hash_session_id(raw_session_id),
            user_id=user.user_id,
            expires_at=now + timedelta(seconds=expires_in),
        )
    )
    database.commit()
    return raw_session_id, expires_in


def set_session_cookie(response: Response, request: Request, raw_session_id: str, expires_in: int):
    settings = request.app.state.settings
    response.set_cookie(
        settings.session_cookie_name,
        raw_session_id,
        max_age=expires_in,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path='/',
    )


def clear_session_cookie(response: Response, request: Request):
    settings = request.app.state.settings
    response.delete_cookie(
        settings.session_cookie_name,
        path='/',
        samesite=settings.session_cookie_samesite,
    )
