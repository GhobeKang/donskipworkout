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
    last_sets: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB(), 'postgresql'), default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.current_timestamp())


class sharedExerciseItem(databaseBase):
    __tablename__ = 'shared_exercise_items'
    exercise_id: Mapped[int] = mapped_column(id_type, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))


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
