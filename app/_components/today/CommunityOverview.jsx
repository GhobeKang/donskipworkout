import { useEffect, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import ChallengeGoalRow from './ChallengeGoalRow';
import OverviewRow from './OverviewRow';
import styles from './Dashboard.module.css';

function featured_challenge(rounds) {
  const latest_by_room = new Map();
  for (const round of rounds) {
    const previous = latest_by_room.get(round.room_uuid);
    if (!previous || round.round_number > previous.round_number) latest_by_room.set(round.room_uuid, round);
  }
  const rooms = [...latest_by_room.values()];
  const room = rooms.find((item) => item.status === 'active')
    || rooms.find((item) => item.status === 'scheduled')
    || rooms.find((item) => !['completed', 'cancelled'].includes(item.status))
    || rooms[0];
  return { room, room_count: rooms.length };
}

function CommunityRows({ user_uuid, revision, pending, on_unauthorized, on_navigate }) {
  const { t } = useLanguage();
  const [message_revision, set_message_revision] = useState(0);
  const challenges = useApiResource('/challenge-rooms', revision, on_unauthorized, { localize_response: false });
  const coaching = useApiResource('/mentorship', `${revision}:${message_revision}`, on_unauthorized);

  useEffect(() => {
    const refresh_messages = () => set_message_revision((value) => value + 1);
    window.addEventListener('coaching-notifications-updated', refresh_messages);
    return () => window.removeEventListener('coaching-notifications-updated', refresh_messages);
  }, []);

  const { room, room_count } = featured_challenge(challenges.error ? [] : challenges.data?.rooms || []);
  const open_challenge = () => on_navigate('challenge', { challenge: room_count === 1 ? { room_uuid: room.room_uuid } : null });

  const connections = coaching.error ? null : coaching.data;
  let coaching_description = t('불러오는 중…');
  if (coaching.error) coaching_description = t('코칭 현황을 불러오지 못했어요.');
  else if (connections) {
    const roles = [];
    if (connections.mentor) roles.push(t('내 코치 {0}', [connections.mentor.counterpart_name]));
    if (connections.apprentice_count) roles.push(t('코칭 회원 {0}명', [connections.apprentice_count]));
    coaching_description = roles.join(' · ') || t('현재 연결된 코치나 회원이 없어요.');
  }
  return <>
    {room ? <ChallengeGoalRow room={room} user_uuid={user_uuid} revision={challenges.loaded_revision}
      pending={pending} on_unauthorized={on_unauthorized} on_open={open_challenge} />
      : <OverviewRow icon="groups" title={t('내 챌린지')} disabled={pending} on_open={open_challenge}
        description={t(challenges.error ? '챌린지 현황을 불러오지 못했어요.' : challenges.loading ? '불러오는 중…' : '참여 중인 챌린지가 없어요.')} />}
    <OverviewRow icon="school" title={t('코칭')} disabled={pending} description={coaching_description}
      badge={connections?.unread_count > 0 && <span className={styles.unreadCount}>{t('읽지 않은 메시지 {0}개', [connections.unread_count])}</span>}
      on_open={() => on_navigate('mentorship', { coaching: { role: !connections?.mentor && connections?.apprentice_count ? 'mentor' : 'apprentice' } })} />
  </>;
}

export default function CommunityOverview({ user_uuid, revision, pending, on_unauthorized, on_navigate, on_refresh }) {
  const { t } = useLanguage();
  const access = useApiResource('/safety/status', revision, on_unauthorized);
  const policy_version = access.data?.community_policy_version;
  const has_consent = policy_version && policy_version === access.data.accepted_policy_version;
  const title = t('챌린지 · 코칭');
  let content;
  if (access.error) {
    content = <OverviewRow icon="refresh" title={title} description={t('참여 현황 다시 불러오기')} disabled={pending} on_open={on_refresh} />;
  } else if (!access.data) {
    content = <p className={styles.overviewLoading} role="status">{title} · {t('불러오는 중…')}</p>;
  } else if (!has_consent) {
    content = <OverviewRow icon="groups" title={title} description={t('참여하려면 이용약관을 확인해 주세요.')}
      disabled={pending} on_open={() => on_navigate('challenge')} />;
  } else {
    content = <CommunityRows user_uuid={user_uuid} revision={access.loaded_revision} pending={pending} on_unauthorized={on_unauthorized} on_navigate={on_navigate} />;
  }
  return <section className={styles.overviewPanel} aria-label={title}>{content}</section>;
}
