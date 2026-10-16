'use client';

import { useId, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { atlas_muscles, muscle_groups, muscle_group_label, muscle_label, muscles_by_id, toggle_muscle_selection } from '../../_lib/anatomy/muscleAtlas';
import MaterialIcon from '../ui/MaterialIcon';
import MuscleMap from './MuscleMap';
import map_styles from './MuscleMap.module.css';

const highlight_colors = [
  { color: '#e97935', label: '주황' }, { color: '#cb4768', label: '분홍' },
  { color: '#447dd1', label: '파랑' }, { color: '#258878', label: '초록' },
  { color: '#8c62c5', label: '보라' },
];

export default function MuscleMapExplorer() {
  const { t, language } = useLanguage();
  const explorer_id = useId();
  const [view, set_view] = useState('front');
  const [selected_muscles, set_selected_muscles] = useState({});
  const [highlight_color, set_highlight_color] = useState(highlight_colors[0].color);
  const [inspected_muscle_id, set_inspected_muscle_id] = useState(null);
  const [search_query, set_search_query] = useState('');
  const [group_filter, set_group_filter] = useState('all');
  const [zoom_level, set_zoom_level] = useState(1);
  const [focus_request, set_focus_request] = useState(null);
  const selected_ids = Object.keys(selected_muscles);
  const normalized_query = search_query.trim().toLocaleLowerCase();
  const visible_muscles = atlas_muscles.filter((muscle) => muscle.views.includes(view)
    && (group_filter === 'all' || muscle.group === group_filter)
    && `${muscle_label(muscle, 'ko')} ${muscle_label(muscle, 'en')} ${muscle.id}`.toLocaleLowerCase().includes(normalized_query));
  const inspected_muscle = muscles_by_id[inspected_muscle_id];

  const toggle_muscle = (muscle_id) => {
    set_selected_muscles((current_selection) => toggle_muscle_selection(current_selection, muscle_id, highlight_color));
    set_inspected_muscle_id(muscle_id);
  };
  const change_view = (next_view) => {
    set_view(next_view);
    set_inspected_muscle_id(null);
    set_zoom_level(1);
    set_focus_request(null);
  };

  return <div className={map_styles.explorer}>
    <p className={map_styles.description}>{t('근육을 눌러 여러 부위를 선택하세요. 다시 누르면 선택이 해제됩니다.')}</p>
    <div className={map_styles.toolbar}>
      <div className={map_styles.viewSwitch} role="group" aria-label={t('신체 방향')}>
        {['front', 'back'].map((map_view) => <button type="button" key={map_view} aria-pressed={view === map_view} onClick={() => change_view(map_view)}>{t(map_view === 'front' ? '앞면' : '뒷면')}</button>)}
      </div>
      <div className={map_styles.zoomControls} role="group" aria-label={t('지도 확대·축소')}>
        <button type="button" disabled={zoom_level === 1} aria-label={t('지도 축소')} onClick={() => set_zoom_level((current_zoom) => Math.max(1, current_zoom - 0.5))}><MaterialIcon>remove</MaterialIcon></button>
        <output aria-label={t('확대 배율')}>{Math.round(zoom_level * 100)}%</output>
        <button type="button" disabled={zoom_level === 2.5} aria-label={t('지도 확대')} onClick={() => set_zoom_level((current_zoom) => Math.min(2.5, current_zoom + 0.5))}><MaterialIcon>add</MaterialIcon></button>
      </div>
    </div>
    <fieldset className={map_styles.colorPicker}>
      <legend>{t('선택 색상')}</legend>
      <div className={map_styles.colorOptions}>
        {highlight_colors.map((option) => <button type="button" key={option.color} className={map_styles.colorOption}
          style={{ '--swatch-color': option.color }} aria-label={t('{0} 강조 색상', [t(option.label)])}
          aria-pressed={highlight_color === option.color} onClick={() => set_highlight_color(option.color)}>
          <span aria-hidden="true">{highlight_color === option.color ? '✓' : ''}</span>
        </button>)}
        <button type="button" className={map_styles.applyColor} disabled={!selected_ids.length} onClick={() => set_selected_muscles((current_selection) =>
          Object.fromEntries(Object.keys(current_selection).map((muscle_id) => [muscle_id, highlight_color])))}>{t('선택 부위에 적용')}</button>
      </div>
    </fieldset>
    <div className={map_styles.mapViewport} tabIndex={0} aria-label={t('확대 시 스크롤하여 근육 지도를 이동하세요')}>
      <MuscleMap view={view} selected_muscles={selected_muscles} language={language} on_toggle={toggle_muscle} on_inspect={set_inspected_muscle_id} focus_request={focus_request} zoom_level={zoom_level} />
    </div>
    <p className={map_styles.inspectedMuscle}>{inspected_muscle
      ? <><strong>{muscle_label(inspected_muscle, language)}</strong><span>{muscle_group_label(inspected_muscle.group, language)}</span></>
      : t('작은 부위는 지도를 확대하거나 아래 목록에서 선택하세요.')}</p>
    <section className={map_styles.selection} aria-labelledby={`${explorer_id}-selection`}>
      <div className={map_styles.selectionHeading}>
        <h3 id={`${explorer_id}-selection`} role="status" aria-live="polite">{t('선택한 부위 {0}개', [selected_ids.length])}</h3>
        <button type="button" disabled={!selected_ids.length} onClick={() => { set_selected_muscles({}); set_inspected_muscle_id(null); }}>{t('선택 초기화')}</button>
      </div>
      {selected_ids.length ? <ul className={map_styles.selectedList}>
        {selected_ids.map((muscle_id) => {
          const muscle = muscles_by_id[muscle_id];
          const label = muscle_label(muscle, language);
          return <li key={muscle_id}>
            <label className={map_styles.selectedColor}>
              <input type="color" value={selected_muscles[muscle_id]} aria-label={t('{0} 강조 색상 변경', [label])}
                onChange={(event) => { const next_color = event.target.value; set_selected_muscles((current_selection) => ({ ...current_selection, [muscle_id]: next_color })); }} />
            </label>
            <button className={map_styles.selectedName} type="button" onClick={() => {
              change_view(muscle.views.includes(view) ? view : muscle.views[0]);
              set_inspected_muscle_id(muscle_id);
              set_focus_request({ muscle_id });
            }} aria-label={t('{0} 지도에서 보기', [label])}>{label}</button>
            <button type="button" aria-label={t('{0} 선택 해제', [label])} onClick={() => toggle_muscle(muscle_id)}><MaterialIcon>close</MaterialIcon></button>
          </li>;
        })}
      </ul> : <p className={map_styles.emptySelection}>{t('아직 선택한 부위가 없습니다.')}</p>}
    </section>
    <details className={map_styles.muscleList}>
      <summary>{t('근육 목록으로 선택')}</summary>
      <div className={map_styles.listFilters}>
        <label htmlFor={`${explorer_id}-search`}>{t('근육 검색')}</label>
        <input id={`${explorer_id}-search`} type="search" value={search_query} onChange={(event) => set_search_query(event.target.value)} placeholder={t('한글 또는 영문 근육 이름')} />
        <label htmlFor={`${explorer_id}-group`}>{t('부위 필터')}</label>
        <select id={`${explorer_id}-group`} value={group_filter} onChange={(event) => set_group_filter(event.target.value)}>
          <option value="all">{t('전체 부위')}</option>
          {Object.keys(muscle_groups).map((group) => <option key={group} value={group}>{muscle_group_label(group, language)}</option>)}
        </select>
      </div>
      <p className={map_styles.resultCount} role="status">{t('{0} · {1}개 부위', [t(view === 'front' ? '앞면' : '뒷면'), visible_muscles.length])}</p>
      {visible_muscles.length ? <ul className={map_styles.results}>
        {visible_muscles.map((muscle) => <li key={muscle.id}>
          <button type="button" aria-pressed={Object.hasOwn(selected_muscles, muscle.id)} onClick={() => toggle_muscle(muscle.id)}>
            <span><strong>{muscle_label(muscle, language)}</strong><small>{muscle_group_label(muscle.group, language)}</small></span>
            <span aria-hidden="true">{Object.hasOwn(selected_muscles, muscle.id) ? '✓' : '+'}</span>
          </button>
        </li>)}
      </ul> : <p className={map_styles.emptySelection}>{t('일치하는 근육이 없습니다. 검색어나 신체 방향을 바꿔보세요.')}</p>}
    </details>
    <p className={map_styles.note}>{t('선택과 색상은 이 화면에서만 유지됩니다. 운동 기록의 종목 분류는 바뀌지 않습니다.')}</p>
    <p className={map_styles.credits}>Artwork: <a href="https://www.figma.com/community/file/1320468164820924031" target="_blank" rel="noreferrer">Ryan Graves</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="/assets/anatomy/ATTRIBUTION.txt" target="_blank" rel="noreferrer">{t('출처 및 라이선스')}</a></p>
  </div>;
}
