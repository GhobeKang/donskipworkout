import { useLanguage } from '../../_hooks/useLanguage';
import { report_period_choices, report_year } from '../../_lib/reportPeriods';

export default function ReportPeriodPicker({ selection, today, on_change, on_generate }) {
  const { t } = useLanguage();
  const { period_type, year, start_date } = selection;
  const latest_year = report_year(period_type, today);
  const choices = report_period_choices(period_type, year, today);
  const change_period = (next_type, next_year) => {
    const next_choices = report_period_choices(next_type, next_year, today);
    on_change({ period_type: next_type, year: next_year, start_date: next_choices[0].start });
  };
  return <form className="reportPeriodPicker" onSubmit={(event) => { event.preventDefault(); on_generate(); }}>
    <div className="tabs" aria-label={t('리포트 유형')}>
      {[['weekly', '주간'], ['monthly', '월간']].map(([type, label]) => <button key={type} type="button" aria-pressed={period_type === type} className={period_type === type ? 'isActive' : ''} onClick={() => { if (type !== period_type) change_period(type, report_year(type, today)); }}>{t(label)}</button>)}
    </div>
    <div className="reportPeriodFields">
      <label>{t('연도')}<select value={year} onChange={(event) => change_period(period_type, Number(event.target.value))}>
        {Array.from({ length: latest_year - 1999 }, (_, index) => latest_year - index).map((report_year) => <option key={report_year} value={report_year}>{report_year}</option>)}
      </select></label>
      <label>{t(period_type === 'weekly' ? '주차 선택' : '월 선택')}<select value={start_date} onChange={(event) => on_change({ ...selection, start_date: event.target.value })}>
        {choices.map((period) => <option key={period.start} value={period.start}>{period_type === 'weekly' ? t('{0}주차 · {1} ~ {2}', [period.number, period.start, period.end]) : t('{0}월', [period.number])}</option>)}
      </select></label>
    </div>
    <p className="infoText">{t(period_type === 'weekly' ? 'ISO 주차 기준 · 월요일부터 일요일까지 비교해요.' : '선택한 달의 1일부터 말일까지 비교해요.')}</p>
    <button className="wideButton primary" type="submit">{t('리포트 생성하기')}</button>
  </form>;
}
