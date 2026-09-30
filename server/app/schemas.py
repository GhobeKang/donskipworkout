from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StrictBool, field_validator


class requestModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class loginRequest(requestModel):
    email: EmailStr = Field(max_length=255)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class registerRequest(loginRequest):
    password: SecretStr = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator('display_name')
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError('A nonempty display name without control characters is required')
        return value


class settingsData(requestModel):
    schedule_days: list[Annotated[int, Field(strict=True, ge=0, le=6)]] = Field(max_length=7)
    workout_time: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
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


class exerciseInput(requestModel):
    name: str = Field(min_length=1, max_length=100)

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


class exerciseData(BaseModel):
    exercise_source: Literal['shared', 'custom']
    exercise_id: int
    name: str
    last_sets: list[workoutSetData]


class userData(BaseModel):
    user_uuid: str
    email: str | None
    display_name: str | None


class authenticationData(BaseModel):
    expires_in: int
    user: userData


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


class reportComparisonSummary(BaseModel):
    exercise_count: int
    comparable_count: int
    uncomparable_count: int
    improved_count: int
    maintained_count: int
    declined_count: int
    comparisons: list[reportComparisonData]


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


class reportNewExerciseData(reportExerciseData):
    first_date: str


class reportChallengeData(BaseModel):
    new_exercises: list[reportNewExerciseData]
    personal_records: list[reportComparisonData]
    record_exercise_count: int


class reportPreferenceData(reportExerciseData):
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


class personalReportData(BaseModel):
    comparison_start: str
    comparison_end: str
    history_start: str | None
    recent: reportComparisonSummary
    journey: reportComparisonSummary
    consistency: reportConsistencyData
    recovery: reportRecoveryData
    challenges: reportChallengeData
    preferences: list[reportPreferenceData]
    coverage: reportCoverageData
    evaluation: reportEvaluationData


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


class settingsOptions(BaseModel):
    day_names: list[str]
    roast_labels: dict[str, str]
    roast_quotes: dict[str, str]
