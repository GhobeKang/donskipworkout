from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Time,
    UniqueConstraint,
    case,
    create_engine,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


class databaseBase(DeclarativeBase):
    metadata = MetaData(schema='attendance')


id_type = BigInteger().with_variant(Integer, 'sqlite')


class userAccount(databaseBase):
    __tablename__ = 'users'
    user_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    user_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(100))
    country_code: Mapped[str] = mapped_column(String(2), default='KR')
    timezone: Mapped[str] = mapped_column(String(64), default='Asia/Seoul')
    community_policy_version: Mapped[str | None] = mapped_column(String(32))
    community_policy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


class userCredential(databaseBase):
    __tablename__ = 'user_credentials'
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class authSession(databaseBase):
    __tablename__ = 'auth_sessions'
    session_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class attendanceSetting(databaseBase):
    __tablename__ = 'attendance_settings'
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'), primary_key=True)
    workout_time: Mapped[time] = mapped_column(Time, default=time(19))
    roast_level: Mapped[str] = mapped_column(String(10), default='off')
    reuse_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_workout_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_free_workout_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_missed_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_snooze_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class scheduleDay(databaseBase):
    __tablename__ = 'attendance_schedule_days'
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'), primary_key=True)
    day_of_week: Mapped[int] = mapped_column(Integer, primary_key=True)


class weeklyPromise(databaseBase):
    __tablename__ = 'weekly_promise_changes'
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'), primary_key=True)
    effective_week: Mapped[date] = mapped_column(Date, primary_key=True)
    target_count: Mapped[int] = mapped_column(Integer)
    baseline_date: Mapped[date] = mapped_column(Date)


class workoutSession(databaseBase):
    __tablename__ = 'workout_sessions'
    __table_args__ = (UniqueConstraint('user_id', 'workout_date'),)
    session_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    session_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    workout_date: Mapped[date] = mapped_column(Date)
    scheduled_time: Mapped[time] = mapped_column(Time)
    session_status: Mapped[str] = mapped_column(String(10), default='scheduled')
    snooze_count: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(1000))
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    verification_type: Mapped[str | None] = mapped_column(String(10))
    reusable: Mapped[bool] = mapped_column(Boolean, default=True)
    photos: Mapped[list['workoutPhoto']] = relationship(lazy='selectin')
    workout_sets: Mapped[list['workoutSet']] = relationship(lazy='selectin')


class exerciseItem(databaseBase):
    __tablename__ = 'exercise_items'
    exercise_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    name: Mapped[str] = mapped_column(String(100))
    target_area: Mapped[str | None] = mapped_column(String(20))
    target_subarea: Mapped[str | None] = mapped_column(String(30))
    last_sets: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB(), 'postgresql'), default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class sharedExerciseItem(databaseBase):
    __tablename__ = 'shared_exercise_items'
    exercise_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    target_area: Mapped[str | None] = mapped_column(String(20))
    target_subarea: Mapped[str | None] = mapped_column(String(30))


class userSharedExerciseProgress(databaseBase):
    __tablename__ = 'user_shared_exercise_progress'
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'), primary_key=True)
    shared_exercise_id: Mapped[int] = mapped_column(
        id_type, ForeignKey('shared_exercise_items.exercise_id'), primary_key=True
    )
    last_sets: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB(), 'postgresql'), default=list
    )


class workoutSet(databaseBase):
    __tablename__ = 'workout_sets'
    __table_args__ = (UniqueConstraint('session_id', 'exercise_order', 'set_order'),)
    set_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(id_type, ForeignKey('workout_sessions.session_id'))
    exercise_id: Mapped[int | None] = mapped_column(
        id_type, ForeignKey('exercise_items.exercise_id', ondelete='SET NULL')
    )
    shared_exercise_id: Mapped[int | None] = mapped_column(
        id_type, ForeignKey('shared_exercise_items.exercise_id')
    )
    exercise_source: Mapped[str] = mapped_column(String(10), default='custom')
    exercise_name: Mapped[str] = mapped_column(String(100))
    exercise_order: Mapped[int] = mapped_column(Integer)
    set_order: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    reps: Mapped[int] = mapped_column(Integer)


def exercise_report_area():
    return case(
        (
            workoutSet.exercise_source == 'shared',
            case(
                (
                    sharedExerciseItem.target_subarea.is_not(None),
                    sharedExerciseItem.target_area + ' · ' + sharedExerciseItem.target_subarea,
                ),
                else_=sharedExerciseItem.target_area,
            ),
        ),
        else_=case(
            (
                exerciseItem.target_subarea.is_not(None),
                exerciseItem.target_area + ' · ' + exerciseItem.target_subarea,
            ),
            else_=exerciseItem.target_area,
        ),
    )


class workoutPhoto(databaseBase):
    __tablename__ = 'workout_session_photos'
    photo_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(id_type, ForeignKey('workout_sessions.session_id'))
    storage_key: Mapped[str] = mapped_column(String(500))
    original_storage_key: Mapped[str | None] = mapped_column(String(500))
    photo_uuid: Mapped[str | None] = mapped_column(String(36), unique=True)
    submission_id: Mapped[str | None] = mapped_column(String(36), unique=True)
    original_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    frame_id: Mapped[str | None] = mapped_column(String(64))
    filter_id: Mapped[str | None] = mapped_column(String(64))
    effect_version: Mapped[int | None] = mapped_column(Integer)
    is_reusable: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengeRoom(databaseBase):
    __tablename__ = 'challenge_rooms'
    room_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    room_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    host_user_id: Mapped[int | None] = mapped_column(id_type, ForeignKey('users.user_id'))
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(300))
    member_limit: Mapped[int] = mapped_column(Integer, default=10)
    status: Mapped[str] = mapped_column(String(20), default='open')
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengeRound(databaseBase):
    __tablename__ = 'challenge_rounds'
    round_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    room_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rooms.room_id'))
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    previous_round_id: Mapped[int | None] = mapped_column(
        id_type, ForeignKey('challenge_rounds.round_id')
    )
    status: Mapped[str] = mapped_column(String(24), default='draft')
    start_at: Mapped[datetime | None] = mapped_column(DateTime)
    end_at: Mapped[datetime | None] = mapped_column(DateTime)
    settlement_end_at: Mapped[datetime | None] = mapped_column(DateTime)
    timezone: Mapped[str] = mapped_column(String(40), default='Asia/Seoul')
    rulebook_version: Mapped[int] = mapped_column(Integer, default=0)
    roster_version: Mapped[int] = mapped_column(Integer, default=1)
    draft_rulebook: Mapped[dict] = mapped_column(
        JSON().with_variant(JSONB(), 'postgresql'), default=dict
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengeRoundMember(databaseBase):
    __tablename__ = 'challenge_round_members'
    __table_args__ = (UniqueConstraint('round_id', 'user_id'),)
    member_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    participant_status: Mapped[str] = mapped_column(String(24), default='joined_pending')
    consented_rulebook_version: Mapped[int | None] = mapped_column(Integer)
    consented_roster_version: Mapped[int | None] = mapped_column(Integer)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class coachingQuestion(databaseBase):
    __tablename__ = 'coaching_questions'
    __table_args__ = (UniqueConstraint('round_id', 'author_user_id', 'request_id'),)
    question_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    question_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    author_user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    host_user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    request_id: Mapped[str] = mapped_column(String(36))
    category: Mapped[str] = mapped_column(String(24))
    body: Mapped[str] = mapped_column(String(2000))
    awaiting_host: Mapped[bool] = mapped_column(Boolean, default=True)
    is_removed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class coachingReply(databaseBase):
    __tablename__ = 'coaching_replies'
    __table_args__ = (UniqueConstraint('question_id', 'sender_user_id', 'request_id'),)
    reply_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(id_type, ForeignKey('coaching_questions.question_id'))
    sender_user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    request_id: Mapped[str] = mapped_column(String(36))
    body: Mapped[str] = mapped_column(String(2000))
    is_removed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class challengeRulebook(databaseBase):
    __tablename__ = 'challenge_rulebooks'
    __table_args__ = (UniqueConstraint('round_id', 'version'),)
    rulebook_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    version: Mapped[int] = mapped_column(Integer)
    target_count: Mapped[int] = mapped_column(Integer)
    duration_days: Mapped[int] = mapped_column(Integer)
    verification_mode: Mapped[str] = mapped_column(String(24))
    description: Mapped[str | None] = mapped_column(String(1000))
    rulebook_json: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'))
    published_at: Mapped[datetime] = mapped_column(DateTime)


class challengeInvitation(databaseBase):
    __tablename__ = 'challenge_invitations'
    invitation_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengeInviteAttempt(databaseBase):
    __tablename__ = 'challenge_invite_attempts'
    attempt_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(id_type, ForeignKey('users.user_id'))
    remote_address_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengePeriod(databaseBase):
    __tablename__ = 'challenge_periods'
    __table_args__ = (UniqueConstraint('round_id', 'period_index'),)
    period_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    period_index: Mapped[int] = mapped_column(Integer)
    start_at: Mapped[datetime] = mapped_column(DateTime)
    end_at: Mapped[datetime] = mapped_column(DateTime)
    target_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default='upcoming')


class challengeVerificationEvent(databaseBase):
    __tablename__ = 'challenge_verification_events'
    event_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    event_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    session_id: Mapped[int] = mapped_column(id_type, ForeignKey('workout_sessions.session_id'))
    photo_id: Mapped[int | None] = mapped_column(
        id_type, ForeignKey('workout_session_photos.photo_id')
    )
    evaluation_date: Mapped[date] = mapped_column(Date)
    verification_type: Mapped[str] = mapped_column(String(10))
    accepted_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default='accepted')
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengeCheckin(databaseBase):
    __tablename__ = 'challenge_checkins'
    __table_args__ = (UniqueConstraint('round_id', 'user_id', 'evaluation_date'),)
    checkin_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    period_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_periods.period_id'))
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    evaluation_date: Mapped[date] = mapped_column(Date)
    verification_event_id: Mapped[int] = mapped_column(
        id_type, ForeignKey('challenge_verification_events.event_id')
    )
    status: Mapped[str] = mapped_column(String(20), default='accepted')
    reason_code: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class challengeEvaluation(databaseBase):
    __tablename__ = 'challenge_evaluations'
    __table_args__ = (UniqueConstraint('round_id', 'evaluation_version'),)
    evaluation_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    evaluation_version: Mapped[int] = mapped_column(Integer)
    method_version: Mapped[str] = mapped_column(String(20), default='v1')
    rulebook_version: Mapped[int] = mapped_column(Integer)
    source_watermark: Mapped[datetime] = mapped_column(DateTime)
    finalized_at: Mapped[datetime] = mapped_column(DateTime)
    result_json: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'))


class workoutTimer(databaseBase):
    __tablename__ = 'workout_timers'
    timer_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    timer_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    status: Mapped[str] = mapped_column(String(20), default='running')
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    measured_seconds: Mapped[int] = mapped_column(Integer, default=0)
    record_source: Mapped[str] = mapped_column(String(20), default='timer_recorded')
    revision: Mapped[int] = mapped_column(Integer, default=1)
    needs_review_reason: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class workoutTimerEvent(databaseBase):
    __tablename__ = 'workout_timer_events'
    __table_args__ = (UniqueConstraint('timer_id', 'request_id'),)
    event_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    timer_id: Mapped[int] = mapped_column(id_type, ForeignKey('workout_timers.timer_id'))
    request_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(20))
    server_received_at: Mapped[datetime] = mapped_column(DateTime)
    client_action_at: Mapped[datetime | None] = mapped_column(DateTime)
    expected_revision: Mapped[int] = mapped_column(Integer)
    resulting_revision: Mapped[int] = mapped_column(Integer)


class workoutTimerSegment(databaseBase):
    __tablename__ = 'workout_timer_segments'
    segment_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    timer_id: Mapped[int] = mapped_column(id_type, ForeignKey('workout_timers.timer_id'))
    segment_started_at: Mapped[datetime] = mapped_column(DateTime)
    segment_ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    record_source: Mapped[str] = mapped_column(String(20), default='timer_recorded')
    segment_status: Mapped[str] = mapped_column(String(20), default='accepted')


class workoutTimerRevision(databaseBase):
    __tablename__ = 'workout_timer_revisions'
    revision_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    timer_id: Mapped[int] = mapped_column(id_type, ForeignKey('workout_timers.timer_id'))
    previous_seconds: Mapped[int] = mapped_column(Integer)
    updated_seconds: Mapped[int] = mapped_column(Integer)
    changed_by_user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    reason: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime)


class userBlock(databaseBase):
    __tablename__ = 'user_blocks'
    blocker_user_id: Mapped[int] = mapped_column(
        id_type, ForeignKey('users.user_id'), primary_key=True
    )
    blocked_user_id: Mapped[int] = mapped_column(
        id_type, ForeignKey('users.user_id'), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class contentReport(databaseBase):
    __tablename__ = 'content_reports'
    report_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    report_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    reporter_user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    target_user_id: Mapped[int | None] = mapped_column(id_type, ForeignKey('users.user_id'))
    content_type: Mapped[str] = mapped_column(String(16))
    content_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(24))
    details: Mapped[str] = mapped_column(String(1000), default='')
    content_snapshot: Mapped[str] = mapped_column(String(2400), default='')
    status: Mapped[str] = mapped_column(String(16), default='open')
    resolution: Mapped[str | None] = mapped_column(String(24))
    resolution_note: Mapped[str | None] = mapped_column(String(1000))
    reviewed_by_user_id: Mapped[int | None] = mapped_column(id_type, ForeignKey('users.user_id'))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)


class photoDeletionJob(databaseBase):
    __tablename__ = 'photo_deletion_jobs'
    job_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default='pending')
    last_error: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class notificationPreference(databaseBase):
    __tablename__ = 'notification_preferences'
    __table_args__ = (UniqueConstraint('round_id', 'user_id'),)
    preference_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    room_news_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    host_nudge_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    quiet_start: Mapped[time] = mapped_column(Time, default=time(21, 0))
    quiet_end: Mapped[time] = mapped_column(Time, default=time(9, 0))
    timezone: Mapped[str] = mapped_column(String(64), default='Asia/Seoul')
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class pushDevice(databaseBase):
    __tablename__ = 'push_devices'
    __table_args__ = (
        UniqueConstraint('user_id', 'installation_uuid'),
        UniqueConstraint('provider', 'token_hash'),
    )
    device_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    installation_uuid: Mapped[str] = mapped_column(String(36))
    platform: Mapped[str] = mapped_column(String(10))
    provider: Mapped[str] = mapped_column(String(10))
    token: Mapped[str] = mapped_column(String(4096))
    token_hash: Mapped[str] = mapped_column(String(64))
    workout_push_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String(2), default='ko')
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class notificationEvent(databaseBase):
    __tablename__ = 'notification_events'
    event_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    event_uuid: Mapped[str] = mapped_column(String(36), unique=True)
    event_key: Mapped[str] = mapped_column(String(200), unique=True)
    round_id: Mapped[int | None] = mapped_column(id_type, ForeignKey('challenge_rounds.round_id'))
    recipient_user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    sender_user_id: Mapped[int | None] = mapped_column(id_type, ForeignKey('users.user_id'))
    category: Mapped[str] = mapped_column(String(24))
    title: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(String(300))
    payload: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), 'postgresql'), default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class notificationInbox(databaseBase):
    __tablename__ = 'notification_inbox'
    event_id: Mapped[int] = mapped_column(
        id_type, ForeignKey('notification_events.event_id'), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(id_type, ForeignKey('users.user_id'))
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class notificationOutbox(databaseBase):
    __tablename__ = 'notification_outbox'
    __table_args__ = (UniqueConstraint('event_id', 'device_id'),)
    outbox_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(id_type, ForeignKey('notification_events.event_id'))
    device_id: Mapped[int] = mapped_column(id_type, ForeignKey('push_devices.device_id'))
    status: Mapped[str] = mapped_column(String(20), default='queued')
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime)
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime)


def create_database(database_url: str | URL):
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=5,
        pool_timeout=5,
        hide_parameters=True,
        isolation_level='READ COMMITTED',
        connect_args={
            'connect_timeout': 5,
            'prepare_threshold': None,
        },
    )

    @event.listens_for(engine, 'connect')
    def configure_connection(database_connection, connection_record):
        # Supavisor may ignore startup options. Configure the actual PostgreSQL
        # session after connecting, outside a transaction so rollback preserves it.
        previous_autocommit = database_connection.autocommit
        database_connection.autocommit = True
        try:
            with database_connection.cursor() as cursor:
                cursor.execute(
                    "SET SESSION TIME ZONE 'UTC'; "
                    "SET SESSION statement_timeout = '10s'; "
                    "SET SESSION lock_timeout = '5s'; "
                    "SET SESSION idle_in_transaction_session_timeout = '15s'"
                )
        finally:
            database_connection.autocommit = previous_autocommit

    return engine


def create_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_database(request):
    # Typed FastAPI dependency is defined in security.py.
    with request.app.state.session_factory() as database:
        yield database
