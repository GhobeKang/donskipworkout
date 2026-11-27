import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import ChallengeStatus from '../challenge/ChallengeStatus';
import OverviewRow from './OverviewRow';
import styles from './Dashboard.module.css';

const tracked_statuses = ['scheduled', 'active', 'settling', 'completed'];
const planning_statuses = ['draft', 'awaiting_consent'];

function personal_round_counts(periods, user_uuid) {
  if (!periods?.length || !user_uuid) return null;
  const counts = { completed: 0, target: 0, credited: 0, expired_shortfall: 0 };
  for (const period of periods) {
    const member = period.members?.find((entry) => entry.user_uuid === user_uuid);
    if (!member || ['removed', 'withdrawn'].includes(member.status)) return null;
    const completed_count = member.completed_count;
    const target_count = member.target_count ?? period.target_count;
    if (!Number.isInteger(completed_count) || completed_count < 0 || !Number.isInteger(target_count) || target_count <= 0) return null;
    // Each week's extra check-ins count toward attendance, but only up to that week's goal.
    const credited = Math.min(completed_count, target_count);
    counts.completed += completed_count;
    counts.target += target_count;
    counts.credited += credited;
    if (['settling', 'finalized'].includes(period.status)) counts.expired_shortfall += target_count - credited;
  }
  return counts;
}

function PersonalGoal({ counts, status }) {
  const { t } = useLanguage();
  const remaining = counts.target - counts.credited;
  const extra_checkins = counts.completed - counts.credited;
  const round_closed = status === 'settling' || status === 'completed';
  const notes = [];
  let remaining_label = t('{0}회 남음', [remaining]);
  if (remaining === 0) remaining_label = t('목표 달성');
  else if (round_closed || remaining === counts.expired_shortfall) remaining_label = t('{0}회 미달', [remaining]);
  else if (counts.expired_shortfall) {
    remaining_label = t('남은 기간에 {0}회 필요', [remaining - counts.expired_shortfall]);
    notes.push(t('지난 주차 {0}회 미달', [counts.expired_shortfall]));
  }
  if (extra_checkins) notes.push(t('내 인증 {0}회 중 {1}회는 주간 목표 초과', [counts.completed, extra_checkins]));
  return <span className={styles.challengeGoal}>
    <span className={styles.goalFigures}>
      <span>{t(extra_checkins ? '목표 반영 {0}회 · 목표 {1}회' : '내 인증 {0}회 · 목표 {1}회', [counts.credited, counts.target])}</span>
      <strong>{remaining_label}</strong>
    </span>
    <span className={styles.goalTrack} aria-hidden="true">
      <span style={{ width: `${100 * counts.credited / counts.target}%` }} />
    </span>
    {notes.length > 0 && <small>{notes.join(' · ')}</small>}
  </span>;
}

function TrackedChallengeRow({ room, user_uuid, revision, on_unauthorized, ...row_props }) {
  const { t } = useLanguage();
  const progress = useApiResource(`/challenge-rounds/${room.round_uuid}/progress`, revision, on_unauthorized, { localize_response: false });
  const round = !progress.error && progress.data?.round_uuid === room.round_uuid ? progress.data : null;
  const counts = personal_round_counts(round?.periods, user_uuid);
  const status = round?.status || room.status;
  return <OverviewRow {...row_props} badge={<ChallengeStatus status={status} />}>
    {counts ? <PersonalGoal counts={counts} status={status} />
      : <span className={styles.goalNotice}>{t(progress.loading ? '불러오는 중…' : '내 인증 현황을 확인할 수 없어요.')}</span>}
  </OverviewRow>;
}

function PlannedChallengeRow({ room, user_uuid, revision, on_unauthorized, ...row_props }) {
  const { t } = useLanguage();
  const details = useApiResource(`/challenge-rooms/${room.room_uuid}`, revision, on_unauthorized, { localize_response: false });
  const round = !details.error && details.data?.round_uuid === room.round_uuid ? details.data : null;
  const status = round?.status || room.status;
  if (tracked_statuses.includes(status)) {
    return <TrackedChallengeRow room={room} user_uuid={user_uuid} revision={revision} on_unauthorized={on_unauthorized} {...row_props} />;
  }
  const rules = status === 'draft' ? round?.draft_rulebook : round?.rulebook;
  const target = rules?.target_count * (rules?.duration_days / 7);
  return <OverviewRow {...row_props} badge={<ChallengeStatus status={status} />}>
    {planning_statuses.includes(status) && <span className={styles.goalNotice}>
      {Number.isInteger(target) && target > 0 ? t('예정 목표 {0}회 · 인증 시작 전', [target])
        : t(details.loading ? '불러오는 중…' : '예정 목표를 확인할 수 없어요.')}
    </span>}
  </OverviewRow>;
}

export default function ChallengeGoalRow({ room, user_uuid, revision, on_unauthorized, pending, on_open }) {
  const { t } = useLanguage();
  const row_props = { title: t('내 챌린지'), icon: 'groups', description: room.name, disabled: pending, on_open };
  const source_props = { room, user_uuid, revision, on_unauthorized };
  if (tracked_statuses.includes(room.status)) return <TrackedChallengeRow {...source_props} {...row_props} />;
  if (planning_statuses.includes(room.status)) return <PlannedChallengeRow {...source_props} {...row_props} />;
  return <OverviewRow {...row_props} badge={<ChallengeStatus status={room.status} />} />;
}
