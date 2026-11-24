import { lazy, Suspense, useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import { subarea_label } from '../../_lib/exerciseClassification';
import { normalize_selected_ids, primary_muscle_target, selectable_targets, target_definition, target_group_definitions, toggle_muscle_selection, toggle_target_selection } from '../../_lib/anatomy/exerciseTargets';
import RequestState from '../ui/RequestState';
import ExerciseTargetOptions from './ExerciseTargetOptions';
import picker_styles from './ExerciseTargetPicker.module.css';

const MuscleMap = lazy(() => import('../anatomy/MuscleMap'));

export default function ExerciseTargetPicker({ target_area, selected_ids, disabled, on_change, on_unauthorized }) {
  const { t, language } = useLanguage();
  const [view, set_view] = useState(['등', '엉덩이'].includes(target_area) ? 'back' : 'front');
  const [zoom_level, set_zoom_level] = useState(1);
  const [reload_count, set_reload_count] = useState(0);
  const [active_muscle_id, set_active_muscle_id] = useState(null);
  const catalog = useApiResource('/exercise-subareas', reload_count, on_unauthorized);
  const subareas = catalog.data || [];
  const available_subareas = subareas.filter((item) => item.target_area === target_area).map(target_definition);
  const subareas_by_id = new Map(available_subareas.map((item) => [item.subarea_id, item]));
  const normalized_ids = normalize_selected_ids(selected_ids, available_subareas);
  const selected_targets = normalized_ids.map((subarea_id) => subareas_by_id.get(subarea_id)).filter(Boolean);
  const available_targets = selectable_targets(subareas, target_area);
  const target_groups = Object.entries(target_group_definitions).map(([group_id, group]) => ({
    ...group, group_id, targets: available_targets.filter((target) => target.selection_group === group_id),
  })).filter((group) => group.targets.length);
  const grouped_ids = new Set(target_groups.flatMap((group) => group.targets.map((target) => target.subarea_id)));
  const unmapped_targets = available_targets.filter((target) => !grouped_ids.has(target.subarea_id) && target.map_precision === 'none');
  const list_targets = available_targets.filter((target) => !grouped_ids.has(target.subarea_id) && target.map_precision !== 'none');
  const visible_targets = available_targets.filter((item) => item.views.includes(view));
  const selectable_muscle_ids = [...new Set(available_targets.flatMap((item) => item.atlas_muscle_ids))]
    .filter((muscle_id) => primary_muscle_target(available_targets, muscle_id));
  const selected_muscle_ids = [...new Set(selected_targets.flatMap((item) => item.atlas_muscle_ids))];
  const selection_labels = Object.fromEntries(selectable_muscle_ids.map((muscle_id) => [
    muscle_id, subarea_label(primary_muscle_target(available_targets, muscle_id), language),
  ]));
  const highlighted_muscles = Object.fromEntries(selected_muscle_ids.map((muscle_id) => [muscle_id, 'var(--orange)']));
  const selection_disabled = !target_area || disabled || catalog.loading || Boolean(catalog.error);
  const apply_selection = (next_ids) => on_change(next_ids.filter((subarea_id) => subareas_by_id.has(subarea_id)));

  const toggle_subarea = (subarea_id) => {
    if (selection_disabled) return;
    apply_selection(toggle_target_selection(normalized_ids, subarea_id, available_subareas));
  };
  const toggle_muscle = (muscle_id) => {
    if (selection_disabled) return;
    set_active_muscle_id(muscle_id);
    apply_selection(toggle_muscle_selection(normalized_ids, muscle_id, available_subareas));
  };

  return <div className={picker_styles.picker}>
    <p className="infoText">{t('운동에서 강조할 타겟을 선택하세요. 완전한 고립 자극을 뜻하지 않습니다.')}</p>
    <RequestState loading={catalog.loading} error={catalog.error} on_retry={reload_count < 2 ? () => set_reload_count((count) => count + 1) : undefined} />
    {!!subareas.length && <>
      {target_groups.map((group) => <ExerciseTargetOptions key={group.group_id} title={group.title} note={group.note}
        targets={group.targets} selected_ids={normalized_ids} disabled={selection_disabled} on_toggle={toggle_subarea} />)}
      {!!unmapped_targets.length && <ExerciseTargetOptions title="지도에 도형이 없는 부위"
        note="도형이 없는 근육도 선택할 수 있습니다. 인접한 다른 근육에 대신 표시하지 않습니다."
        targets={unmapped_targets} selected_ids={normalized_ids} disabled={selection_disabled} on_toggle={toggle_subarea} />}
      {!!selectable_muscle_ids.length && <>
      <div className={picker_styles.toolbar}>
        <div className="tabs" aria-label={t('신체 방향')}>{['front', 'back'].map((map_view) => <button type="button" key={map_view} disabled={disabled} aria-pressed={view === map_view} className={view === map_view ? 'isActive' : ''} onClick={() => { set_view(map_view); set_active_muscle_id(null); }}>{t(map_view === 'front' ? '앞면' : '뒷면')}</button>)}</div>
        <div className={picker_styles.zoomControls}>
          <button type="button" disabled={disabled || zoom_level === 1} aria-label={t('지도 축소')} onClick={() => set_zoom_level((value) => Math.max(1, value - 0.5))}>−</button>
          <span>{Math.round(zoom_level * 100)}%</span>
          <button type="button" disabled={disabled || zoom_level === 3} aria-label={t('지도 확대')} onClick={() => set_zoom_level((value) => Math.min(3, value + 0.5))}>+</button>
        </div>
      </div>
      <div className={picker_styles.mapViewport}>
        <Suspense fallback={<p role="status">{t('근육 지도를 불러오는 중…')}</p>}><MuscleMap view={view} language={language} zoom_level={zoom_level} highlighted_muscles={highlighted_muscles}
          selected_muscle_ids={selected_muscle_ids} selectable_muscle_ids={selectable_muscle_ids} selection_labels={selection_labels} active_muscle_id={active_muscle_id} on_inspect={set_active_muscle_id} on_toggle={toggle_muscle} disabled={selection_disabled} /></Suspense>
      </div>
      <p className={picker_styles.activeTarget} aria-live="polite">{active_muscle_id && primary_muscle_target(available_targets, active_muscle_id) ? subarea_label(primary_muscle_target(available_targets, active_muscle_id), language) : t(visible_targets.length ? '부위를 누르면 선택됩니다.' : '현재 면에서 선택할 수 있는 부위가 없습니다. 앞면·뒷면을 전환해 주세요.')}</p>
      </>}
      {!available_targets.length && <p className="infoText">{t('이 카테고리는 세부 부위를 선택하지 않고 저장할 수 있습니다.')}</p>}
      <div className={picker_styles.selectionHeading}><strong aria-live="polite">{t('선택한 부위 {0}개', [selected_targets.length])}</strong><button type="button" className="textButton" disabled={selection_disabled || !selected_targets.length} onClick={() => apply_selection([])}>{t('선택 해제')}</button></div>
      <div className={picker_styles.selectedTargets}>{selected_targets.map((target) => <button type="button" key={target.subarea_id} disabled={selection_disabled} aria-label={t('{0} 선택 해제', [subarea_label(target, language)])} onClick={() => apply_selection(normalized_ids.filter((subarea_id) => subarea_id !== target.subarea_id))}>{subarea_label(target, language)} <span aria-hidden="true">×</span></button>)}</div>
      {!!list_targets.length && <details className={picker_styles.targetList}><summary>{t('부위 목록으로 선택')}</summary><div>{list_targets.map((target) => <label key={target.subarea_id}><input type="checkbox" checked={normalized_ids.includes(target.subarea_id)} disabled={selection_disabled} onChange={() => toggle_subarea(target.subarea_id)} /><span>{subarea_label(target, language)}{target.map_precision === 'partial' && <small>{t('지도에는 일부 구성근만 표시됩니다.')}</small>}</span></label>)}</div></details>}
      {!!selectable_muscle_ids.length && <p className={picker_styles.credits}>Artwork: <a href="https://www.figma.com/community/file/1320468164820924031" target="_blank" rel="noreferrer">Ryan Graves</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>}
    </>}
  </div>;
}
