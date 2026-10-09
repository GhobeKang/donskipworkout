import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';

export function get_progress_status_label(t, status) {
  const status_labels = {
    upcoming: t('시작 전'),
    target_met_pending: t('목표 달성 · 잠정'),
    achieved: t('목표 달성'),
    at_risk: t('목표 달성 어려움'),
    in_progress: t('진행 중'),
    missed: t('목표 미달'),
    withdrawn: t('중도 종료'),
    removed: t('참여 종료'),
  };
  return status_labels[status] || t('상태 확인 필요');
}

export default function ChallengeProgressMember({ member, is_self }) {
  const { language, t } = useLanguage();
  const member_progress_percent = Math.min(100, Math.max(0,
    member.achievement_percent ?? Math.round(member.completed_count / member.target_count * 100)));
  const checkins = member.accepted_checkins?.length ? member.accepted_checkins : (member.accepted_dates || []).map(
    (evaluation_date) => ({ evaluation_date, accepted_at: null }),
  );
  const date_formatter = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return <li>
    <details className="challengeProgressMemberDetails">
      <summary>
        <span className="challengeProgressMemberMain">
          <span className="challengeProgressMemberName"><strong>{member.display_name}{is_self ? ` · ${t('나')}` : ''}</strong><span>{get_progress_status_label(t, member.status)}</span></span>
          <span className="challengeProgressMemberScore"><strong>{member.completed_count}<small> / {member.target_count}{t('일')}</small></strong><span>{t('인증 내역 보기')}</span></span>
          <MaterialIcon className="challengeProgressChevron">expand_more</MaterialIcon>
        </span>
        <span className="challengeProgressMemberTrack" aria-hidden="true"><span style={{ width: `${member_progress_percent}%` }} /></span>
      </summary>
      <div className="challengeProgressCheckins">
        <strong>{t('인증 내역')}</strong>
        {checkins.length ? <ol>{checkins.map((checkin) => <li key={checkin.evaluation_date}>
          <time dateTime={checkin.accepted_at || checkin.evaluation_date}>{checkin.accepted_at
            ? date_formatter.format(new Date(checkin.accepted_at))
            : checkin.evaluation_date}</time>
          <span>{t('인증 완료')}</span>
        </li>)}</ol> : <p>{t('인정된 출석 없음')}</p>}
      </div>
    </details>
  </li>;
}
