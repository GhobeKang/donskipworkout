import muscle_atlas from './muscleAtlas.json';

export const atlas_views = muscle_atlas.views;
export const atlas_muscles = muscle_atlas.muscles;
export const muscles_by_id = Object.fromEntries(atlas_muscles.map((muscle) => [muscle.id, muscle]));

export function muscle_label(muscle, language) {
  const side_labels = language === 'en'
    ? { left: 'Left', right: 'Right', center: '' }
    : { left: '왼쪽', right: '오른쪽', center: '' };
  const muscle_name = language === 'en' ? muscle.label_en : muscle.label_ko;
  return [side_labels[muscle.side], muscle_name].filter(Boolean).join(' ');
}

