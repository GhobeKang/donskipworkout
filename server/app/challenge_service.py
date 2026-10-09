from datetime import date, datetime, timedelta
from math import floor
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select

from .challenge_report import build_round_growth_reports
from .database import (
    challengeCheckin,
    challengeEvaluation,
    challengePeriod,
    challengeRound,
    challengeRoundMember,
    challengeRulebook,
    challengeVerificationEvent,
)

seoul_timezone = ZoneInfo('Asia/Seoul')


def local_workout_date(accepted_at: datetime) -> date:
    return accepted_at.replace(tzinfo=ZoneInfo('UTC')).astimezone(seoul_timezone).date()


def accepted_checkins_for_round(database, round_id: int):
    checkin_rows = database.execute(
        select(
            challengePeriod.period_index,
            challengeCheckin.user_id,
            challengeCheckin.evaluation_date,
            challengeVerificationEvent.accepted_at,
        )
        .join(challengePeriod, challengePeriod.period_id == challengeCheckin.period_id)
        .join(
            challengeVerificationEvent,
            challengeVerificationEvent.event_id == challengeCheckin.verification_event_id,
        )
        .where(
            challengeCheckin.round_id == round_id,
            challengeCheckin.status == 'accepted',
        )
        .order_by(challengeCheckin.evaluation_date, challengeVerificationEvent.accepted_at)
    ).all()
    checkins_by_member = {}
    for period_index, user_id, evaluation_date, accepted_at in checkin_rows:
        checkins_by_member.setdefault((period_index, user_id), []).append({
            'evaluation_date': evaluation_date.isoformat(),
            'accepted_at': accepted_at.isoformat() + 'Z',
        })
    return checkins_by_member


def record_activity_for_challenges(
    database,
    user_id: int,
    session_id: int,
    verification_type: str,
    accepted_at: datetime,
    photo_id: int | None = None,
):
    evaluation_date = local_workout_date(accepted_at)
    rows = database.execute(
        select(challengeRound, challengeRoundMember, challengeRulebook)
        .join(challengeRoundMember, challengeRoundMember.round_id == challengeRound.round_id)
        .join(
            challengeRulebook,
            (challengeRulebook.round_id == challengeRound.round_id)
            & (challengeRulebook.version == challengeRound.rulebook_version),
        )
        .where(
            challengeRoundMember.user_id == user_id,
            challengeRoundMember.participant_status.in_(['consented', 'active']),
            challengeRound.status.in_(['scheduled', 'active']),
            challengeRound.start_at <= accepted_at,
            challengeRound.end_at > accepted_at,
        )
        .with_for_update()
    ).all()

    for current_round, member, rulebook in rows:
        if rulebook.verification_mode == 'photo_required' and verification_type != 'photo':
            continue
        period = database.scalar(
            select(challengePeriod).where(
                challengePeriod.round_id == current_round.round_id,
                challengePeriod.start_at <= accepted_at,
                challengePeriod.end_at > accepted_at,
            )
        )
        if period is None:
            continue

        if current_round.status == 'scheduled':
            current_round.status = 'active'
            for current_member in database.scalars(
                select(challengeRoundMember).where(
                    challengeRoundMember.round_id == current_round.round_id,
                    challengeRoundMember.participant_status == 'consented',
                )
            ):
                current_member.participant_status = 'active'
        period.status = 'active'

        event = challengeVerificationEvent(
            event_uuid=str(uuid4()),
            round_id=current_round.round_id,
            user_id=user_id,
            session_id=session_id,
            photo_id=photo_id,
            evaluation_date=evaluation_date,
            verification_type=verification_type,
            accepted_at=accepted_at,
            status='accepted',
        )
        database.add(event)
        database.flush()
        checkin = database.scalar(
            select(challengeCheckin)
            .where(
                challengeCheckin.round_id == current_round.round_id,
                challengeCheckin.user_id == user_id,
                challengeCheckin.evaluation_date == evaluation_date,
            )
            .with_for_update()
        )
        if checkin is None:
            database.add(
                challengeCheckin(
                    round_id=current_round.round_id,
                    period_id=period.period_id,
                    user_id=user_id,
                    evaluation_date=evaluation_date,
                    verification_event_id=event.event_id,
                    status='accepted',
                )
            )
        elif verification_type == 'photo':
            checkin.verification_event_id = event.event_id


def round_progress(database, current_round: challengeRound, now: datetime):
    rulebook = database.scalar(
        select(challengeRulebook).where(
            challengeRulebook.round_id == current_round.round_id,
            challengeRulebook.version == current_round.rulebook_version,
        )
    )
    if rulebook is None:
        raise HTTPException(409, '평가할 룰북이 없습니다.')
    members = database.execute(
        select(challengeRoundMember, challengeRoundMember.user_id)
        .where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.participant_status != 'invited',
        )
        .order_by(challengeRoundMember.joined_at, challengeRoundMember.member_id)
    ).all()
    periods = database.scalars(
        select(challengePeriod)
        .where(challengePeriod.round_id == current_round.round_id)
        .order_by(challengePeriod.period_index)
    ).all()
    seoul_now = now.replace(tzinfo=ZoneInfo('UTC')).astimezone(seoul_timezone)
    checkins_by_member = accepted_checkins_for_round(database, current_round.round_id)
    period_results = []
    for period in periods:
        member_results = []
        for member, _ in members:
            accepted_checkins = checkins_by_member.get((period.period_index, member.user_id), [])
            accepted_dates = [checkin['evaluation_date'] for checkin in accepted_checkins]
            completed_count = len(accepted_dates)
            target_count = period.target_count
            remaining_count = max(target_count - completed_count, 0)
            period_end = period.end_at.replace(tzinfo=ZoneInfo('UTC')).astimezone(seoul_timezone).date()
            available_dates = max((period_end - seoul_now.date()).days, 0)
            is_live = current_round.status == 'active' and now < period.end_at
            if member.participant_status == 'removed':
                status = 'removed'
            elif member.participant_status == 'withdrawn':
                status = 'withdrawn'
            elif now < period.start_at:
                status = 'upcoming'
            elif completed_count >= target_count:
                status = 'achieved' if not is_live else 'target_met_pending'
            elif is_live and available_dates < remaining_count:
                status = 'at_risk'
            elif is_live:
                status = 'in_progress'
            else:
                status = 'missed'
            member_results.append({
                'user_id': member.user_id,
                'completed_count': completed_count,
                'target_count': target_count,
                'credited_count': min(completed_count, target_count),
                'remaining_count': remaining_count,
                'achievement_percent': min(100, floor(100 * completed_count / target_count + 0.5)),
                'extra_count': max(completed_count - target_count, 0),
                'accepted_dates': accepted_dates,
                'accepted_checkins': accepted_checkins,
                'status': status,
            })
        period_status = (
            'upcoming' if now < period.start_at
            else 'active' if now < period.end_at
            else 'settling'
        )
        period_results.append({
            'period_index': period.period_index,
            'start_at': period.start_at.isoformat() + 'Z',
            'end_at': period.end_at.isoformat() + 'Z',
            'target_count': period.target_count,
            'status': period_status,
            'members': member_results,
        })
    return period_results


def advance_round_status(database, current_round: challengeRound, now: datetime):
    if current_round.status == 'scheduled' and current_round.start_at and now >= current_round.start_at:
        current_round.status = 'active'
        for member in database.scalars(
            select(challengeRoundMember).where(
                challengeRoundMember.round_id == current_round.round_id,
                challengeRoundMember.participant_status == 'consented',
            )
        ):
            member.participant_status = 'active'
    if current_round.status == 'active' and current_round.end_at and now >= current_round.end_at:
        current_round.status = 'settling'


def finalize_round_if_due(database, current_round: challengeRound, now: datetime):
    if current_round.status == 'completed':
        return database.scalar(
            select(challengeEvaluation.result_json)
            .where(challengeEvaluation.round_id == current_round.round_id)
            .order_by(challengeEvaluation.evaluation_version.desc())
            .limit(1)
        )
    if (
        current_round.status not in {'active', 'settling'}
        or current_round.settlement_end_at is None
        or now < current_round.settlement_end_at
    ):
        return None
    current_round.status = 'settling'
    previous = database.scalar(
        select(challengeEvaluation)
        .where(challengeEvaluation.round_id == current_round.round_id)
        .order_by(challengeEvaluation.evaluation_version.desc())
        .limit(1)
        .with_for_update()
    )
    if previous:
        return previous.result_json
    progress = round_progress(database, current_round, now)
    participants = database.scalars(
        select(challengeRoundMember).where(
            challengeRoundMember.round_id == current_round.round_id,
            challengeRoundMember.participant_status != 'invited',
        )
    ).all()
    member_results = {}
    for period in progress:
        for member_result in period['members']:
            user_periods = member_results.setdefault(
                member_result['user_id'], {'periods': [], 'completed_count': 0, 'target_count': 0}
            )
            user_periods['periods'].append(member_result)
            user_periods['completed_count'] += member_result['completed_count']
            user_periods['target_count'] += member_result['target_count']

    results = []
    for member in participants:
        participant_result = member_results.get(member.user_id, {
            'periods': [], 'completed_count': 0, 'target_count': 0,
        })
        all_periods_achieved = len(participant_result['periods']) == len(progress) and all(
            period_result['completed_count'] >= period_result['target_count']
            for period_result in participant_result['periods']
        )
        if member.participant_status == 'withdrawn':
            result_status = 'withdrawn'
        elif member.participant_status == 'removed':
            result_status = 'removed'
        else:
            result_status = 'achieved' if all_periods_achieved else 'missed'
        results.append({
            'user_id': member.user_id,
            'participant_status': member.participant_status,
            'result': result_status,
            **participant_result,
        })
    denominator = len(participants)
    achieved_count = sum(result['result'] == 'achieved' for result in results)
    result_snapshot = {
        'round_uuid': current_round.round_uuid,
        'status': 'completed',
        'evaluation_version': 1,
        'method_version': 'v1',
        'rulebook_version': current_round.rulebook_version,
        'finalized_at': now.isoformat() + 'Z',
        'achievement_rate': floor(100 * achieved_count / denominator + 0.5) if denominator else 0,
        'achieved_count': achieved_count,
        'participant_count': denominator,
        'periods': progress,
        'members': results,
        'growth_reports': build_round_growth_reports(database, current_round, now),
    }
    database.add(
        challengeEvaluation(
            round_id=current_round.round_id,
            evaluation_version=1,
            method_version='v1',
            rulebook_version=current_round.rulebook_version,
            source_watermark=now,
            finalized_at=now,
            result_json=result_snapshot,
        )
    )
    current_round.status = 'completed'
    for period in database.scalars(
        select(challengePeriod).where(challengePeriod.round_id == current_round.round_id)
    ):
        period.status = 'finalized'
    return result_snapshot


def create_round_periods(
    database,
    current_round: challengeRound,
    start_at: datetime,
    duration_days: int,
    target_count: int,
):
    period_count = duration_days // 7
    for period_index in range(period_count):
        period_start = start_at + timedelta(days=period_index * 7)
        period_end = period_start + timedelta(days=7)
        database.add(
            challengePeriod(
                round_id=current_round.round_id,
                period_index=period_index + 1,
                start_at=period_start,
                end_at=period_end,
                target_count=target_count,
                status='upcoming',
            )
        )
