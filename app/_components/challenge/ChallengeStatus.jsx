import { useLanguage } from '../../_hooks/useLanguage';

const status_labels = {
  draft: '룰북 작성 중',
  awaiting_consent: '참가 동의 대기',
  scheduled: '개시 예약됨',
  active: '진행 중',
  settling: '결과 확인 중',
  review_required: '운영 확인 필요',
  completed: '회차 종료',
  cancelled: '취소됨',
};

export default function ChallengeStatus({ status }) {
  const { t } = useLanguage();
  return <span className="challengeStatus">{t(status_labels[status] || status)}</span>;
}
