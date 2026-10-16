'use client';

import { useEffect, useRef, useState } from 'react';
import { api_request } from '../../_lib/api';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from '../ui/MaterialIcon';
import ChallengeMemberReport from './ChallengeMemberReport';

export default function ChallengeMemberReports({ round_uuid, round_status, is_active, on_unauthorized }) {
  const { t, localize_message } = useLanguage();
  const [summary_data, set_summary_data] = useState(null);
  const [summary_loading, set_summary_loading] = useState(false);
  const [summary_error, set_summary_error] = useState('');
  const [selected_member_uuid, set_selected_member_uuid] = useState('');
  const [member_report, set_member_report] = useState(null);
  const [detail_loading, set_detail_loading] = useState(false);
  const [detail_error, set_detail_error] = useState('');
  const [refresh_version, set_refresh_version] = useState(0);
  const heading_ref = useRef(null);
  const member_buttons = useRef(new Map());
  const team_summary = summary_data?.team_summary;

  useEffect(() => {
    if (!is_active) return;
    const request_controller = new AbortController();
    set_summary_loading(true);
    set_summary_error('');
    api_request(`/challenge-rounds/${round_uuid}/member-reports`, { signal: request_controller.signal })
      .then((result) => {
        if (!request_controller.signal.aborted) set_summary_data(result);
      })
      .catch((error) => {
        if (request_controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        else set_summary_error(localize_message(error.message));
      })
      .finally(() => { if (!request_controller.signal.aborted) set_summary_loading(false); });
    return () => request_controller.abort();
  }, [round_uuid, round_status, is_active, refresh_version, on_unauthorized, localize_message]);

  useEffect(() => {
    if (!is_active || !selected_member_uuid) return;
    const request_controller = new AbortController();
    set_detail_loading(true);
    set_detail_error('');
    set_member_report(null);
    api_request(`/challenge-rounds/${round_uuid}/member-reports/${selected_member_uuid}`, { signal: request_controller.signal })
      .then((result) => {
        if (!request_controller.signal.aborted) set_member_report(result);
      })
      .catch((error) => {
        if (request_controller.signal.aborted) return;
        if (error.status === 401) on_unauthorized();
        else set_detail_error(localize_message(error.message));
      })
      .finally(() => { if (!request_controller.signal.aborted) set_detail_loading(false); });
    return () => request_controller.abort();
  }, [round_uuid, round_status, selected_member_uuid, is_active, refresh_version, on_unauthorized, localize_message]);

  useEffect(() => {
    if (member_report) heading_ref.current?.focus();
  }, [member_report]);

  const return_to_members = () => {
    const previous_member_uuid = selected_member_uuid;
    set_selected_member_uuid('');
    set_member_report(null);
    set_detail_error('');
    window.requestAnimationFrame(() => member_buttons.current.get(previous_member_uuid)?.focus());
  };

  return <article className="challengeCard challengeGrowthReports">
    <div className="sectionHeading">
      <div><p className="eyebrow">{t('방장 전용')}</p><h2>{t('팀원 성장 리포트')}</h2></div>
      <button type="button" className="challengeReportRefresh" disabled={summary_loading || detail_loading} onClick={() => set_refresh_version((value) => value + 1)} aria-label={t('리포트 새로고침')}><MaterialIcon>refresh</MaterialIcon></button>
    </div>
    <p className="challengeGrowthIntro">{t('팀원을 선택하면 수행한 운동과 이전 기간 대비 성장의 근거를 볼 수 있습니다.')}</p>
    {summary_data && <span className="challengeReportBadge">{t(summary_data.report_state === 'finalized' ? '결과 확정' : '결과 확인 중 · 잠정 리포트')}</span>}
    {summary_error && <div className="requestState" role="alert"><p>{summary_error}</p></div>}
    {summary_loading && !summary_data && <p role="status">{t('리포트 불러오는 중…')}</p>}
    {team_summary && !selected_member_uuid && <div className="teamGrowthSummary">
      <h3>{t('팀의 수행·유지·복귀')}</h3>
      <p>{t('전체 {0}명 · 수행 비교 가능 {1}명 · 비교 자료 부족 {2}명', [team_summary.member_count, team_summary.comparable_member_count, team_summary.insufficient_member_count])}</p>
      <dl>
        <div><dt>{t('동일 조건 수행 향상')}</dt><dd>{t('{0}/{1}명', [team_summary.improved_member_count, team_summary.comparable_member_count])}</dd></div>
        <div><dt>{t('반복 확인된 수행 유지')}</dt><dd>{t('{0}/{1}명', [team_summary.repeated_maintained_member_count, team_summary.comparable_member_count])}</dd></div>
        <div><dt>{t('기간 내 개인 목표 달성')}</dt><dd>{team_summary.goal_evaluable_member_count > 0 ? t('{0}/{1}명', [team_summary.goal_kept_member_count, team_summary.goal_evaluable_member_count]) : t('평가 자료 부족')}</dd></div>
        <div><dt>{t('목표 미달 후 복귀 달성')}</dt><dd>{t('{0}명', [team_summary.recovered_member_count])}</dd></div>
        <div><dt>{t('기록 확인이 필요한 멤버')}</dt><dd>{t('{0}/{1}명', [team_summary.review_member_count, team_summary.comparable_member_count])}</dd></div>
      </dl>
      <p>{t('각 항목은 중복 집계될 수 있습니다. 비교 자료 부족은 성장 0점이 아니에요.')}</p>
    </div>}
    {!selected_member_uuid ? <ul className="challengeGrowthMemberList">{summary_data?.members.map((member) => <li key={member.user_uuid}>
      <button type="button" onClick={() => set_selected_member_uuid(member.user_uuid)} ref={(element) => { if (element) member_buttons.current.set(member.user_uuid, element); else member_buttons.current.delete(member.user_uuid); }}>
        <span><strong>{member.display_name}</strong>{member.growth_summary && <>
          <small>{member.growth_summary.comparable_count > 0 ? t('향상 {0} · 유지 {1} · 확인 필요 {2}종목', [member.growth_summary.improved_count + member.growth_summary.mixed_count, member.growth_summary.maintained_count, member.growth_summary.review_count + member.growth_summary.mixed_count]) : t('동일 조건 수행 비교 자료 부족')}</small>
          <small>{t('수행 비교 {0}/{1}종목 · 반복 향상 {2} · 반복 유지 {3}', [member.growth_summary.comparable_count, member.growth_summary.exercise_count, member.growth_summary.repeated_improved_count, member.growth_summary.repeated_maintained_count])}</small>
          <small>{member.growth_summary.evaluated_periods > 0 ? t('기간 내 목표 {0}/{1}주 달성', [member.growth_summary.kept_periods, member.growth_summary.evaluated_periods]) : t('개인 목표 평가 자료 부족')}</small>
          {member.growth_summary.current_streak >= 2 && <small>{t('비교 기간에서 목표 {0}주 연속 달성', [member.growth_summary.current_streak])}</small>}
          {member.growth_summary.recovered_count > 0 && <small>{t('복귀 달성 {0}번', [member.growth_summary.recovered_count])}</small>}
        </>}</span>
        <span className="challengeGrowthMemberScore"><MaterialIcon>chevron_right</MaterialIcon></span>
      </button>
    </li>)}</ul> : <>
      {detail_loading && <p role="status">{t('팀원 리포트 불러오는 중…')}</p>}
      {detail_error && <div className="requestState" role="alert"><p>{detail_error}</p><button type="button" className="wideButton secondary" onClick={return_to_members}>{t('팀원 목록')}</button></div>}
      {member_report && <ChallengeMemberReport report={member_report} heading_ref={heading_ref} on_back={return_to_members} />}
    </>}
    {summary_data?.members.length === 0 && <p className="emptyState">{t('리포트를 조회할 수 있는 참가자가 없습니다.')}</p>}
  </article>;
}
