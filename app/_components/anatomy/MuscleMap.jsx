'use client';

import { useId } from 'react';
import { atlas_views, muscle_label, muscles_by_id } from '../../_lib/anatomy/muscleAtlas';
import map_styles from './MuscleMap.module.css';

export default function MuscleMap({ view, highlighted_muscles = {}, activity_by_muscle = {}, active_muscle_id, language, on_inspect = () => {}, zoom_level = 1, selected_muscle_ids = null, selectable_muscle_ids = null, selection_labels = {}, on_toggle, disabled = false }) {
  const map_id = useId();
  const view_data = atlas_views[view];
  const selection_mode = Boolean(on_toggle);
  const selected_ids = new Set(selected_muscle_ids || []);
  const selectable_ids = selectable_muscle_ids === null ? null : new Set(selectable_muscle_ids);
  const diagram_label = selection_mode
    ? language === 'en' ? 'Select multiple muscle targets. Tap again to deselect.' : '여러 타겟 부위를 선택하는 인체도. 다시 누르면 선택이 해제됩니다.'
    : language === 'en'
    ? `${view === 'front' ? 'Front' : 'Back'} muscle activity map. Inspect a region to view its records.`
    : `${view === 'front' ? '앞면' : '뒷면'} 근육 활동 지도. 부위를 누르면 해당 분류의 기록을 확인합니다.`;

  return <svg className={map_styles.diagram} viewBox={view_data.view_box} style={{ width: `${zoom_level * 100}%` }} role="group" aria-label={diagram_label}>
    {view_data.layers.map((layer, layer_index) => {
      const muscle = muscles_by_id[layer.muscle_id];
      const is_selectable = !selection_mode || selectable_ids === null || selectable_ids.has(muscle?.id);
      const is_interactive = Boolean(muscle && is_selectable && !disabled);
      const is_inspected = Boolean(muscle && (selection_mode ? selected_ids.has(muscle.id) : muscle.id === active_muscle_id));
      const activity = activity_by_muscle[muscle?.id];
      const label = muscle ? selection_mode && selection_labels[muscle.id] || muscle_label(muscle, language) : '';
      return <g key={layer_index}
        id={muscle ? `${map_id}-${view}-${muscle.id}` : undefined}
        className={muscle ? `${map_styles.muscleRegion}${is_inspected ? ` ${map_styles.isInspected}` : ''}${activity?.is_coarse ? ` ${map_styles.isCoarse}` : ''}${!is_selectable ? ` ${map_styles.isUnavailable}` : ''}` : map_styles.bodyBase}
        style={muscle && highlighted_muscles[muscle.id] ? { '--region-color': highlighted_muscles[muscle.id] } : undefined}
        role={muscle ? 'button' : undefined} tabIndex={muscle ? is_interactive ? 0 : -1 : undefined}
        aria-label={muscle ? label : undefined} aria-pressed={muscle ? is_inspected : undefined}
        aria-hidden={muscle ? undefined : true} aria-disabled={muscle && !is_interactive ? true : undefined} data-muscle-id={muscle?.id}
        onClick={is_interactive ? () => { if (selection_mode) on_toggle(muscle.id); else on_inspect(muscle.id); } : undefined}
        onFocus={is_interactive ? () => on_inspect(muscle.id) : undefined}
        onMouseEnter={is_interactive ? () => on_inspect(muscle.id) : undefined}
        onKeyDown={is_interactive ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!event.repeat) { if (selection_mode) on_toggle(muscle.id); else on_inspect(muscle.id); }
          }
        } : undefined}>
        {muscle && <title>{label}</title>}
        {layer.paths.map((path, path_index) => <path key={path_index} d={path.d}
          fill={path.fill} fillRule={path['fill-rule']} clipRule={path['clip-rule']}
          opacity={path.opacity} stroke={path.stroke} strokeWidth={path['stroke-width']}
          vectorEffect="non-scaling-stroke" />)}
      </g>;
    })}
  </svg>;
}
