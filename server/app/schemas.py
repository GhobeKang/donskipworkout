import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    StrictBool,
    field_validator,
    model_validator,
)


class requestModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class loginRequest(requestModel):
    email: EmailStr = Field(max_length=255)
    password: SecretStr = Field(min_length=1, max_length=128)
    installation_uuid: UUID | None = None

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class registerRequest(loginRequest):
    password: SecretStr = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)
    country_code: str = Field(default='KR', pattern=r'^[A-Z]{2}$')
    timezone: str = Field(default='Asia/Seoul', min_length=1, max_length=64)
    accepted_policy_version: str = Field(min_length=1, max_length=32)

    @field_validator('display_name')
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError('A nonempty display name without control characters is required')
        return value

    @field_validator('timezone')
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError('A valid IANA timezone is required') from None
        return value


class settingsData(requestModel):
    schedule_days: list[Annotated[int, Field(strict=True, ge=0, le=6)]] = Field(max_length=7)
    workout_time: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    country_code: str | None = Field(default=None, pattern=r'^[A-Z]{2}$')
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    roast_level: Literal['off', 'spicy', 'hot']
    reuse_enabled: StrictBool
    notification_workout_enabled: StrictBool = True
    notification_free_workout_enabled: StrictBool = False
    notification_missed_enabled: StrictBool = True
    notification_snooze_enabled: StrictBool = True

    @field_validator('schedule_days')
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError('Duplicate schedule days are not allowed')
        return sorted(value)

    @field_validator('timezone')
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        return registerRequest.validate_timezone(value) if value is not None else None


exercise_target_area = Literal[
    '가슴', '등', '어깨', '이두', '삼두', '복근', '엉덩이', '허벅지', '종아리', '전신'
]
exercise_target_subareas = json.loads(
    Path(__file__).with_name('exercise_target_areas.json').read_text(encoding='utf-8')
)


class exerciseInput(requestModel):
    name: str = Field(min_length=1, max_length=100)
    target_area: exercise_target_area
    target_subarea: str | None = Field(default=None, max_length=30)

    @field_validator('target_subarea', mode='before')
    @classmethod
    def normalize_target_subarea(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode='after')
    def validate_target_subarea(self):
        if (
            self.target_subarea is not None
            and self.target_subarea not in exercise_target_subareas[self.target_area]
        ):
            raise ValueError('세부분류가 선택한 타겟 부위에 속하지 않습니다.')
        return self

    @field_validator('name')
    @classmethod
    def normalize_name(cls, value: str) -> str:
        name = ' '.join(value.split())
        if not name or any(ord(character) < 32 for character in name):
            raise ValueError('Exercise name must be nonempty without control characters')
        return name


class workoutSetInput(requestModel):
    weight_kg: Decimal = Field(ge=0, le=999.99, max_digits=5, decimal_places=2)
    reps: int = Field(strict=True, ge=1, le=1000)


class exerciseGroupInput(requestModel):
    exercise_source: Literal['shared', 'custom'] = 'custom'
    exercise_id: int = Field(strict=True, gt=0)
    exercise_name: str | None = Field(default=None, max_length=100)
    sets: list[workoutSetInput] = Field(min_length=1, max_length=20)


class sessionAction(requestModel):
    action: Literal['go', 'snooze', 'rest', 'manual']
    note: str | None = Field(default=None, max_length=1000)


class workoutGroupsInput(requestModel):
    exercise_groups: list[exerciseGroupInput] = Field(default_factory=list, max_length=30)


class workoutSetData(BaseModel):
    weight_kg: float
    reps: int


class exerciseGroupData(BaseModel):
    exercise_source: Literal['shared', 'custom']
    exercise_id: int | None
    exercise_name: str
    sets: list[workoutSetData]


class workoutLogData(BaseModel):
    workout_date: str
    exercise_groups: list[exerciseGroupData] = Field(default_factory=list)


class areaImportExerciseData(exerciseGroupData):
    target_area: exercise_target_area
    source_workout_date: str
    session_count: int


class areaWorkoutImportData(BaseModel):
    workout_date: str
    target_area: exercise_target_area
    session_count: int
    exercise_groups: list[areaImportExerciseData] = Field(default_factory=list)


class exerciseData(BaseModel):
    exercise_source: Literal['shared', 'custom']
    exercise_id: int
    name: str
    target_area: str | None
    target_subarea: str | None = None
    last_sets: list[workoutSetData]


class userData(BaseModel):
    user_uuid: str
    email: str | None
    display_name: str | None
    community_policy_version: str | None = None


class authenticationData(BaseModel):
    expires_in: int
    user: userData


class workoutTimeDay(BaseModel):
    workout_date: str
    measured_seconds: int
    timer_recorded_seconds: int
    self_reported_seconds: int
    timer_count: int
    measurement_status: Literal['measured'] = 'measured'


class sessionData(BaseModel):
    session_uuid: str
    workout_date: str
    date: str
    title: str
    status: str
    session_status: Literal['scheduled', 'started', 'completed', 'rest', 'missed']
    scheduled_time: str
    snooze_count: int
    note: str | None
    verification_type: Literal['manual', 'photo'] | None
    photo_path: str | None = None
    reusable: bool
    started_at: str | None
    completed_at: str | None
    exercise_groups: list[exerciseGroupData] = Field(default_factory=list)
    workout_time: workoutTimeDay | None = None


class weeklyAttendance(BaseModel):
    completed_count: int
    target_count: int
    progress_percent: int
    remaining_count: int


class todayData(BaseModel):
    workout_date: str
    timezone: str
    workout_time: str
    hero_quote: str
    progress_message: str
    is_scheduled_day: bool
    session: sessionData | None
    weekly_attendance: weeklyAttendance
    memory: sessionData | None


class calendarData(BaseModel):
    year: int
    month: int
    days: list[int]
    first_day_of_week: int
    completed_days: list[int]
    rest_days: list[int]
    missed_days: list[int]
    day_statuses: dict[int, str]


class paginationData(BaseModel):
    offset: int
    limit: int
    total: int
    has_more: bool


class recordsData(BaseModel):
    calendar: calendarData
    records: list[sessionData]
    pagination: paginationData


class statsData(BaseModel):
    completed_count: int
    rest_count: int
    missed_count: int
    pending_count: int
    total_count: int


class shareGrowthData(BaseModel):
    status: Literal['improved', 'no_increase', 'insufficient_data']
    exercise_name: str | None = None
    exercise_source: Literal['shared', 'custom'] | None = None
    weight_kg: float | None = None
    previous_reps: int | None = None
    current_reps: int | None = None


class reportExerciseData(BaseModel):
    exercise_source: Literal['shared', 'custom']
    exercise_id: int
    exercise_name: str


class reportComparisonData(reportExerciseData):
    dimension: Literal['reps', 'weight_kg']
    condition_value: float
    previous_value: float
    current_value: float
    delta: float
    percent_change: float | None
    direction: Literal['improved', 'maintained', 'declined']
    previous_date: str
    current_date: str
    previous_observation_days: int = 0
    current_observation_days: int = 0
    confirmation_dates: list[str] = Field(default_factory=list)
    confirmation_days: int = 0
    evidence_status: Literal['observed', 'repeated'] = 'observed'


class reportPerformanceSummary(BaseModel):
    status: Literal['improving', 'maintaining', 'review_needed', 'mixed', 'insufficient_data']
    exercise_count: int
    comparable_count: int
    uncomparable_count: int
    improved_count: int
    maintained_count: int
    review_count: int
    mixed_count: int
    repeated_improved_count: int
    repeated_maintained_count: int
    comparisons: list[reportComparisonData]


class reportAreaTotals(BaseModel):
    session_count: int
    set_count: int
    rep_count: int
    volume_kg: float


class reportAreaComparison(BaseModel):
    target_area: str
    previous: reportAreaTotals
    current: reportAreaTotals
    direction: Literal['improved', 'maintained', 'declined', 'uncomparable']


class reportComparisonSummary(BaseModel):
    area_count: int
    comparable_count: int
    uncomparable_count: int
    improved_count: int
    maintained_count: int
    declined_count: int
    comparisons: list[reportAreaComparison]
    baseline_start: str | None = None
    baseline_end: str | None = None


class reportWeekData(BaseModel):
    week_start: str
    target_count: int | None
    completed_count: int
    status: Literal['unknown', 'rest', 'in_progress', 'kept', 'missed']


class reportConsistencyData(BaseModel):
    evaluated_weeks: int
    kept_weeks: int
    current_streak: int
    longest_streak: int
    weeks: list[reportWeekData]
    period_weeks: list[reportWeekData] = Field(default_factory=list)
    period_evaluated_weeks: int = 0
    period_kept_weeks: int = 0


class reportRecoveryEvent(BaseModel):
    missed_week: str
    return_week: str
    first_return_date: str | None
    status: Literal['recovered', 'pending', 'not_recovered']


class reportRecoveryData(BaseModel):
    opportunity_count: int
    recovered_count: int
    recovery_percent: int | None
    pending_count: int
    events: list[reportRecoveryEvent]


class reportNewAreaData(BaseModel):
    target_area: str
    first_date: str


class reportAreaRecordData(BaseModel):
    target_area: str
    record_count: int


class reportChallengeData(BaseModel):
    new_areas: list[reportNewAreaData]
    personal_record_areas: list[reportAreaRecordData]
    record_area_count: int


class reportPreferenceData(BaseModel):
    target_area: str
    session_count: int
    previous_session_count: int
    session_percent: int | None
    previous_session_percent: int | None


class reportCoverageData(BaseModel):
    completed_count: int
    recorded_count: int
    previous_recorded_count: int
    excluded_set_count: int


class reportEvaluationData(BaseModel):
    profile: Literal[
        'no_activity',
        'mixed_progress',
        'review_conditions',
        'returning',
        'consistent_progress',
        'progressing',
        'consistent',
        'exploring',
        'maintaining',
        'building_baseline',
    ]
    evidence_codes: list[str]
    focus_code: Literal[
        'log_comparable_sets', 'review_comparison', 'keep_next_promise', 'maintain_own_pace'
    ]
    method_version: str


class workoutTimeTotals(BaseModel):
    measured_seconds: int | None
    timer_recorded_seconds: int | None
    self_reported_seconds: int | None
    measured_days: int
    average_seconds: float | None
    timer_count: int
    timed_set_days: int
    timed_set_count: int
    sets_per_hour: float | None
    days: list[workoutTimeDay]


class workoutTimeReport(BaseModel):
    previous: workoutTimeTotals
    current: workoutTimeTotals
    comparable: bool
    total_seconds_change: int | None
    average_seconds_change: float | None
    total_change_percent: float | None
    sets_per_hour_change: float | None
    direction: Literal['insufficient_data', 'increased', 'decreased', 'maintained']


class muscleActivityExercise(BaseModel):
    exercise_key: str
    exercise_source: str
    exercise_id: int | None
    exercise_name: str
    set_count: int


class muscleActivityTarget(BaseModel):
    target_area: str | None
    target_subarea: str | None
    exercise_count: int
    set_count: int
    activity_score: int
    exercises: list[muscleActivityExercise]
    workout_dates: list[str]


class muscleActivitySummary(BaseModel):
    start_date: str
    end_date: str
    exercise_count: int
    set_count: int
    activity_score: int
    recorded_day_count: int
    unclassified_set_count: int
    targets: list[muscleActivityTarget]


class muscleActivityComparison(BaseModel):
    current: muscleActivitySummary
    previous: muscleActivitySummary


class personalReportData(BaseModel):
    comparison_start: str
    comparison_end: str
    history_start: str | None
    recent: reportComparisonSummary
    journey: reportComparisonSummary
    performance: reportPerformanceSummary
    journey_performance: reportPerformanceSummary
    consistency: reportConsistencyData
    recovery: reportRecoveryData
    challenges: reportChallengeData
    preferences: list[reportPreferenceData]
    coverage: reportCoverageData
    evaluation: reportEvaluationData
    workout_time: workoutTimeReport | None = None
    muscle_activity: muscleActivityComparison | None = None


class weeklyShareData(BaseModel):
    week_start: str
    week_end: str
    as_of_date: str
    is_current_week: bool
    is_baseline_week: bool
    target_count: int | None
    next_target_count: int | None
    completed_count: int
    promise_percent: int | None
    extra_count: int | None
    growth: shareGrowthData
    insights: personalReportData


class periodReportData(weeklyShareData):
    period_type: Literal['weekly', 'monthly']
    period_start: str
    period_end: str
    is_current_period: bool


class challengeRoomCreate(requestModel):
    name: str = Field(min_length=2, max_length=30)
    description: str | None = Field(default=None, max_length=300)
    member_limit: int = Field(default=10, strict=True, ge=2, le=10)

    @field_validator('name')
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = ' '.join(value.split())
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError('Room name must be nonempty without control characters')
        return value


class challengeRulebookUpdate(requestModel):
    expected_version: int = Field(strict=True, ge=0)
    target_count: int = Field(default=3, strict=True, ge=1, le=7)
    duration_days: Literal[7, 14, 28] = 7
    verification_mode: Literal['photo_required', 'photo_or_manual'] = 'photo_required'
    start_date: date | None = None
    description: str | None = Field(default=None, max_length=1000)


class challengeInviteJoin(requestModel):
    code: str | None = Field(
        default=None,
        min_length=8,
        max_length=9,
        pattern=r'^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$',
    )
    token: str | None = Field(default=None, min_length=32, max_length=128)

    @model_validator(mode='after')
    def require_one_invite_credential(self):
        if (self.code is None) == (self.token is None):
            raise ValueError('Provide exactly one invitation code or token')
        return self


class workoutTimerStart(requestModel):
    request_id: UUID


class workoutTimerAction(requestModel):
    action: Literal['pause', 'resume', 'finish', 'discard']
    request_id: UUID
    expected_revision: int = Field(strict=True, ge=0)


class workoutTimerReconcile(requestModel):
    action: Literal['pause', 'finish']
    request_id: UUID
    expected_revision: int = Field(strict=True, ge=0)
    client_action_at: datetime


class workoutTimerCorrection(requestModel):
    measured_seconds: int = Field(strict=True, ge=0, le=86400)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator('reason')
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        reason = ' '.join(value.split())
        if not reason or any(ord(character) < 32 for character in reason):
            raise ValueError('A reason without control characters is required')
        return reason


class notificationPreferenceUpdate(requestModel):
    room_news_enabled: StrictBool
    host_nudge_enabled: StrictBool
    quiet_start: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    quiet_end: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')


class pushDeviceRegistration(requestModel):
    installation_uuid: UUID
    platform: Literal['android', 'ios']
    token: str = Field(min_length=20, max_length=4096)
    workout_push_enabled: StrictBool = False
    language: Literal['ko', 'en'] = 'ko'
    user_uuid: UUID | None = None


class pushTestRequest(requestModel):
    installation_uuid: UUID | None = None
    channel: Literal['workout', 'server'] = 'workout'
    delay_seconds: int = Field(default=15, strict=True, ge=0, le=86400)
    ttl_seconds: int = Field(default=600, strict=True, ge=30, le=86400)


class challengeNudgeRequest(requestModel):
    request_id: UUID
    member_uuids: list[UUID] = Field(default_factory=list, max_length=10)


class settingsOptions(BaseModel):
    day_names: list[str]
    roast_labels: dict[str, str]
    roast_quotes: dict[str, str]
