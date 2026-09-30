import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';
import { format_workout_date } from '../../_lib/i18n';
import ExerciseProgress from '../records/ExerciseProgress';
import WeeklyShare from '../sharing/WeeklyShare';

const day_names = ['일', '월', '화', '수', '목', '금', '토'];

function current_month() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === 'year').value), month: Number(parts.find((part) => part.type === 'month').value) };
}

function month_for_date(workout_date) {
  const date_parts = /^(\d{4})-(\d{2})-\d{2}$/.exec(workout_date || '');
  if (!date_parts) return current_month();
  const year = Number(date_parts[1]);
  const month = Number(date_parts[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12
    ? { year, month }
    : current_month();
}

export default function RecordsScreen({ revision, on_unauthorized, initial_tab, initial_workout_date, focus_record_uuid, on_open_record }) {
  const { t, language } = useLanguage();
  const [selected_month, set_selected_month] = useState(() => month_for_date(initial_workout_date));
  const [selected_tab, set_selected_tab] = useState(initial_tab);
  const [reload_count, set_reload_count] = useState(0);
  const { year, month } = selected_month;
  const records = useApiResource('/records?year=' + year + '&month=' + month + '&limit=100', revision + ':' + reload_count, on_unauthorized);
  const stats = useApiResource('/stats', revision + ':' + reload_count, on_unauthorized);
  useEffect(() => {
    if (!focus_record_uuid || selected_tab !== 'list' || !records.data?.records.some((record) => record.session_uuid === focus_record_uuid)) return;
    const record_element = document.getElementById(`record-${focus_record_uuid}`);
    if (!record_element) return;
    record_element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    record_element.focus({ preventScroll: true });
  }, [focus_record_uuid, records.data, selected_tab]);
  const change_month = (offset) => {
    const next_month = new Date(Date.UTC(year, month - 1 + offset, 1));
    set_selected_month({ year: next_month.getUTCFullYear(), month: next_month.getUTCMonth() + 1 });
  };
  const active_resource = selected_tab === 'stats' ? stats : records;
  const calendar_data = records.data?.calendar;
  const stat_labels = { completed_count: t("운동 완료"), rest_count: t("휴식"), missed_count: t("미실행"), pending_count: t("예정 / 출발"), total_count: t("전체 기록") };
  const stat_chart_fields = [
    { field_name: 'completed_count', label: t("완료"), color: 'done' },
    { field_name: 'rest_count', label: t("휴식"), color: 'rest' },
    { field_name: 'missed_count', label: t("미실행"), color: 'missed' },
    { field_name: 'pending_count', label: t("예정"), color: 'pending' },
  ];
  const stat_chart_max = stats.data
    ? Math.max(1, ...stat_chart_fields.map(({ field_name }) => stats.data[field_name]))
    : 1;

  return <section className="viewPanel isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{t('이거 봐봐, 너가 이만큼 해냈어.')}</p><h1>{t('보이는 만큼,\n성장했다는 증거.')}</h1></div></header>
    <button type="button" className="shareEntry" aria-pressed={selected_tab === 'share'} onClick={() => set_selected_tab('share')}><span><strong>{t('나의 변화 리포트')}</strong><small>{t('변화의 근거를 모아, 나만의 리포트로.')}</small></span><MaterialIcon>ios_share</MaterialIcon></button>
    <div className="tabs" aria-label={t("기록 보기")}>{[['calendar', t("캘린더")], ['list', t("운동 목록")], ['progress', t("성장 추이")], ['stats', t("통계")]].map(([tab, label]) => <button type="button" key={tab} className={selected_tab === tab ? 'isActive' : ''} aria-pressed={selected_tab === tab} onClick={() => set_selected_tab(tab)}>{label}</button>)}</div>
    {selected_tab === 'share' && <WeeklyShare revision={revision} on_unauthorized={on_unauthorized} />}
    {selected_tab === 'progress' && <ExerciseProgress revision={revision} on_unauthorized={on_unauthorized} />}
    {['calendar', 'list'].includes(selected_tab) && <div className="calendarHeader">
      <button className="textButton" aria-label={t("이전 달")} disabled={year === 2000 && month === 1} onClick={() => change_month(-1)}>‹</button>
      <strong>{format_workout_date(`${year}-${String(month).padStart(2, '0')}-01`, language, { year: 'numeric', month: 'long' })}</strong>
      <button className="textButton" aria-label={t("다음 달")} disabled={year === 2100 && month === 12} onClick={() => change_month(1)}>›</button>
    </div>}
    {!['progress', 'share'].includes(selected_tab) && <RequestState loading={active_resource.loading} error={active_resource.error} on_retry={() => set_reload_count((value) => value + 1)} />}
    {selected_tab === 'stats' && stats.data && <>
      <p className="infoText">{t("전체 기간 · 실제 저장된 기록 기준")}</p>
      <section className="statsChartCard" aria-labelledby="stats-chart-title">
        <div className="statsChartHeading"><div><p className="cardKicker">{t("한눈에 보기")}</p><h2 id="stats-chart-title">{t("운동 기록 분포")}</h2></div><span>{stats.data.total_count}{t("회")}</span></div>
        <div className="statsChart" role="img" aria-label={stat_chart_fields.map(({ field_name, label }) => t("{0} {1}회", [label, stats.data[field_name]])).join(', ')}>
          {stat_chart_fields.map(({ field_name, label, color }) => {
            const bar_height = stats.data[field_name] ? Math.max(8, Math.round((stats.data[field_name] / stat_chart_max) * 100)) : 0;
            return <div className="statsChartColumn" key={field_name}>
              <div className="statsChartTrack"><span className={`statsChartBar is${color}`} style={{ height: `${bar_height}%` }} /></div>
              <span className="statsChartLabel">{label}</span>
            </div>;
          })}
        </div>
        <p className="statsChartCaption">{t("상태별 기록 횟수 비교")}</p>
      </section>
      <dl className="statsGrid">{Object.entries(stat_labels).map(([field_name, label]) => <div className="settingsCard" key={field_name}><dt>{label}</dt><dd>{stats.data[field_name]}{t("회")}</dd></div>)}</dl>
    </>}
    {selected_tab === 'calendar' && calendar_data && <div className="calendarCard">
      <div className="sectionHeading"><h2>{t('출석의 흔적')}</h2><span className="infoText">{t('{0}일 출석', [calendar_data.completed_days.length])}</span></div>
      <div className="calendarWeekdays">{day_names.map((day) => <span key={day}>{t(day)}</span>)}</div>
      <div className="calendarGrid">
        {Array.from({ length: calendar_data.first_day_of_week }, (_, index) => <div key={'blank-' + index} aria-hidden="true" />)}
        {calendar_data.days.map((day) => {
          const stamp_kind = calendar_data.completed_days.includes(day)
            ? 'completed'
            : calendar_data.rest_days.includes(day)
              ? 'rest'
              : calendar_data.missed_days.includes(day)
                ? 'missed'
                : null;
          const state_label = stamp_kind === 'completed' ? t("운동 완료") : stamp_kind === 'rest' ? t("휴식") : stamp_kind === 'missed' ? t("미실행") : t("완료 기록 없음");
          const workout_date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const day_record = records.data.records.find((record) => record.workout_date === workout_date);
          const day_content = <><span className="calendarDayNumber">{day}</span>{stamp_kind && <span className="calendarStatus" aria-hidden="true">{stamp_kind === 'completed' ? '✓' : stamp_kind === 'rest' ? '−' : '×'}</span>}</>;
          const cell_class_name = `calendarCell${stamp_kind ? ` is${stamp_kind}` : ''}`;
          return day_record ? <button type="button" className={cell_class_name} key={day} aria-label={`${day}${t('일 ')}${state_label}, ${t('기록 보기')}`} onClick={() => on_open_record(day_record)}>{day_content}</button>
            : <div className={cell_class_name} key={day} aria-label={day + t('일 ') + state_label}>{day_content}</div>;
        })}
      </div>
      <div className="legend"><span>✓ {t('운동 완료')}</span><span>− {t('휴식')}</span><span>× {t('미실행')}</span></div>
    </div>}
    {['calendar', 'list'].includes(selected_tab) && records.data && <>
      <div className="recentHeading"><h2>{selected_tab === 'list' ? t("운동 목록") : t("이번 달 기록")}</h2><span>{records.data.pagination.total}{t("건")}</span></div>
      <div className="recordList">{records.data.records.length ? records.data.records.map((record) => {
        const is_focused_record = record.session_uuid === focus_record_uuid;
        return <article className={'recordEntry' + (is_focused_record ? ' isFocused' : '')} id={`record-${record.session_uuid}`} tabIndex={is_focused_record ? -1 : undefined} aria-label={is_focused_record ? t("{0} {1} 기록", [record.date, record.title]) : undefined} key={record.session_uuid}><button className="recordItem recordItemButton" type="button" aria-label={t("{0} {1}, 해당 기록으로 이동", [record.date, record.title])} onClick={() => on_open_record(record)}><time className="recordDate" dateTime={record.workout_date}>{record.date}</time><span className="recordTitle">{record.title}</span><span className="recordMeta">{record.verification_type === 'photo' ? t("사진 인증") : record.status}</span><span className="recordOpenLabel">{t("해당 기록으로 이동")}<MaterialIcon>arrow_forward</MaterialIcon></span></button></article>;
      }) : <p className="emptyState">{t("이 달에 저장된 운동 기록이 없습니다.")}</p>}</div>
    </>}
  </section>;
}
