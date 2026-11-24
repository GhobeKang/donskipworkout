import HelpLink from '../help/HelpLink';
import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import RequestState from '../ui/RequestState';
import MaterialIcon from '../ui/MaterialIcon';
import { format_workout_date } from '../../_lib/i18n';
import ExerciseProgress from '../records/ExerciseProgress';
import WeeklyMuscleActivity from '../records/WeeklyMuscleActivity';
import WeeklyShare from '../sharing/WeeklyShare';
import RecordStatistics from '../records/RecordStatistics';
import { format_workout_duration } from '../../_lib/workoutTime';
import records_styles from './RecordsScreen.module.css';

const day_names = ['일', '월', '화', '수', '목', '금', '토'];

function current_month(timezone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === 'year').value), month: Number(parts.find((part) => part.type === 'month').value) };
}

function month_for_date(workout_date, timezone) {
  const date_parts = /^(\d{4})-(\d{2})-\d{2}$/.exec(workout_date || '');
  if (!date_parts) return current_month(timezone);
  const year = Number(date_parts[1]);
  const month = Number(date_parts[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12
    ? { year, month }
    : current_month(timezone);
}

export default function RecordsScreen({ revision, on_unauthorized, initial_tab, initial_workout_date, focus_record_uuid, on_open_record, timezone = 'Asia/Seoul' }) {
  const { t, language } = useLanguage();
  const [selected_month, set_selected_month] = useState(() => month_for_date(initial_workout_date, timezone));
  const [selected_tab, set_selected_tab] = useState(initial_tab);
  const [reload_count, set_reload_count] = useState(0);
  const { year, month } = selected_month;
  const records = useApiResource('/records?year=' + year + '&month=' + month + '&limit=100', revision + ':' + reload_count, on_unauthorized);
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
  const calendar_data = records.data?.calendar;

  return <section className="viewPanel isVisible">
    <header className="pageHeader"><div><p className="eyebrow">{t('이거 봐봐, 너가 이만큼 해냈어.')}</p><h1>{t('보이는 만큼,\n성장했다는 증거.')}</h1></div></header>
    <HelpLink question_id="records">{t('지난 기록 확인 방법 보기')}</HelpLink>
    <div className="infoEntry"><button type="button" className="shareEntry" aria-pressed={selected_tab === 'share'} onClick={() => set_selected_tab('share')}><span><strong>{t('나의 변화 리포트')}</strong><small>{t('변화의 근거를 모아, 나만의 리포트로.')}</small></span><MaterialIcon>ios_share</MaterialIcon></button></div>
    <div className={records_styles.recordsTabs} role="group" aria-label={t('기록 보기')}>
      {[
        ['calendar', '캘린더', '캘린더'],
        ['list', '목록', '운동 목록'],
        ['muscles', '근육', '근육 활동'],
        ['progress', '성장', '성장 추이'],
        ['stats', '통계', '통계'],
      ].map(([tab_key, tab_label, tab_description]) => <button type="button" key={tab_key} aria-label={t(tab_description)} aria-pressed={selected_tab === tab_key} onClick={() => set_selected_tab(tab_key)}>{t(tab_label)}</button>)}
    </div>
    {selected_tab === 'share' && <WeeklyShare revision={revision} on_unauthorized={on_unauthorized} timezone={timezone} />}
    {selected_tab === 'progress' && <ExerciseProgress revision={revision} on_unauthorized={on_unauthorized} timezone={timezone} />}
    {selected_tab === 'muscles' && <WeeklyMuscleActivity revision={revision} on_unauthorized={on_unauthorized} timezone={timezone} initial_workout_date={initial_workout_date} />}
    {selected_tab === 'stats' && <RecordStatistics revision={revision} year={year} month={month} on_change_month={change_month} on_unauthorized={on_unauthorized} />}
    {['calendar', 'list'].includes(selected_tab) && <div className="calendarHeader">
      <button className="textButton" aria-label={t("이전 달")} disabled={year === 2000 && month === 1} onClick={() => change_month(-1)}>‹</button>
      <strong>{format_workout_date(`${year}-${String(month).padStart(2, '0')}-01`, language, { year: 'numeric', month: 'long' })}</strong>
      <button className="textButton" aria-label={t("다음 달")} disabled={year === 2100 && month === 12} onClick={() => change_month(1)}>›</button>
    </div>}
    {['calendar', 'list'].includes(selected_tab) && <RequestState loading={records.loading} error={records.error} on_retry={reload_count < 2 ? () => set_reload_count((value) => value + 1) : undefined} />}
    {selected_tab === 'calendar' && calendar_data && <div className="calendarCard">
      <div className="sectionHeading"><h2>{t('출석의 흔적')}</h2><span className="infoText">{t('{0}일 출석', [calendar_data.completed_days.length])}</span></div>
      <div className="calendarWeekdays">{day_names.map((day, day_index) => <span key={day}>{language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day_index] : day}</span>)}</div>
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
        return <article className={'recordEntry' + (is_focused_record ? ' isFocused' : '')} id={`record-${record.session_uuid}`} tabIndex={is_focused_record ? -1 : undefined} aria-label={is_focused_record ? t("{0} {1} 기록", [record.date, record.title]) : undefined} key={record.session_uuid}><button className="recordItem recordItemButton" type="button" aria-label={t("{0} {1}, 해당 기록으로 이동", [record.date, record.title]) + (record.workout_time ? ` · ${t('운동 시간')} ${format_workout_duration(record.workout_time.measured_seconds, language)}` : '')} onClick={() => on_open_record(record)}><time className="recordDate" dateTime={record.workout_date}>{record.date}</time><span className="recordTitle">{record.title}</span><span className="recordMeta">{record.verification_type === 'photo' ? t("사진 인증") : record.status}</span><span className="recordOpenLabel">{t("해당 기록으로 이동")}<MaterialIcon>arrow_forward</MaterialIcon></span>{record.workout_time && <span className="recordDuration">{t('운동 시간')} · {format_workout_duration(record.workout_time.measured_seconds, language)}</span>}</button></article>;
      }) : <p className="emptyState">{t("이 달에 저장된 운동 기록이 없습니다.")}</p>}</div>
    </>}
  </section>;
}
