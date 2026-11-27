"""Zero-load abs use a 1 kg reference; assisted load uses saved or current body weight."""

from datetime import timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import case, func


def effective_weight_kg(workout_set, fallback_body_weight_kg=None, target_area=None):
    entered_weight = Decimal(str(workout_set.weight_kg))
    if target_area is None:
        target_area = getattr(workout_set, 'target_area', None)
    if entered_weight == 0 and target_area == '복근':
        return Decimal('1')
    if entered_weight >= 0:
        return entered_weight
    body_weight = getattr(workout_set, 'body_weight_kg', None)
    if body_weight is None:
        body_weight = fallback_body_weight_kg
    if body_weight is None:
        return None
    return max(Decimal('0'), Decimal(str(body_weight)) + entered_weight)


def workout_volume_kg(workout_set, fallback_body_weight_kg=None, target_area=None):
    effective_weight = effective_weight_kg(workout_set, fallback_body_weight_kg, target_area)
    return (effective_weight or Decimal('0')) * workout_set.reps


def workout_volume_expression(
    weight_kg, body_weight_kg, reps, fallback_body_weight_kg=None, target_area=None,
):
    body_weight_kg = func.coalesce(body_weight_kg, fallback_body_weight_kg)
    adjusted_weight = body_weight_kg + weight_kg
    effective_weight = case(
        ((weight_kg == 0) & (target_area == '복근'), 1),
        (weight_kg >= 0, weight_kg),
        (body_weight_kg.is_(None), None),
        (adjusted_weight > 0, adjusted_weight),
        else_=0,
    )
    return func.coalesce(effective_weight, 0) * reps


def snapshot_body_weight_kg(workout_sets, account, workout_date):
    saved_weight = next((
        item.body_weight_kg for item in workout_sets if item.body_weight_kg is not None
    ), None)
    if saved_weight is not None:
        return saved_weight
    if account.body_weight_kg is None or account.body_weight_recorded_at is None:
        return None
    recorded_date = account.body_weight_recorded_at.replace(tzinfo=timezone.utc).astimezone(
        ZoneInfo(account.timezone),
    ).date()
    # A current measurement cannot reconstruct an older workout's body weight.
    return account.body_weight_kg if workout_date >= recorded_date else None
