/*
Chest mapping sample derived from react-native-body-highlighter.
Source commit: 8ed39ac2ae9cb46fb79d77eedec7e5b029a75174
Source: https://github.com/HichamELBSI/react-native-body-highlighter/blob/8ed39ac2ae9cb46fb79d77eedec7e5b029a75174/assets/bodyFront.ts
MIT License

Copyright (c) 2022 ELABBASSI Hicham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Modifications: split each chest outline into three closed target-zone paths.
The target zones are a visualization draft, not independently verified muscles.
*/
(function (sample_scope) {
  'use strict';
  const chest_assets = {
  "schema_version": 1,
  "source": {
    "repository": "HichamELBSI/react-native-body-highlighter",
    "commit": "8ed39ac2ae9cb46fb79d77eedec7e5b029a75174",
    "path": "assets/bodyFront.ts",
    "license": "MIT",
    "copyright": "Copyright (c) 2022 ELABBASSI Hicham",
    "source_url": "https://github.com/HichamELBSI/react-native-body-highlighter/blob/8ed39ac2ae9cb46fb79d77eedec7e5b029a75174/assets/bodyFront.ts"
  },
  "classification_note": "윗·가운데·아랫가슴은 대흉근의 기록용 타겟 구역이다. 이 시안의 곡선 경계는 임상적으로 검증된 독립 근육 경계가 아니다.",
  "side_note": "원본 front path.left는 화면 왼쪽이다. 본 샘플의 side는 정면을 바라보는 사람의 해부학적 좌우로 정규화했다.",
  "view_box": [
    190,
    275,
    350,
    190
  ],
  "original_parts": [
    {
      "shape_key": "front_right_pectoralis_major",
      "side": "right",
      "source_side": "left",
      "path_d": "M272.91 422.84c-18.95-17.19-22-57-12.64-78.79 5.57-12.99 26.54-24.37 39.97-25.87q20.36-2.26 37.02.75c9.74 1.76 16.13 15.64 18.41 25.04 3.99 16.48 3.23 31.38 1.67 48.06q-1.35 14.35-2.05 16.89c-6.52 23.5-38.08 29.23-58.28 24.53-9.12-2.12-17.24-4.38-24.1-10.61z"
    },
    {
      "shape_key": "front_left_pectoralis_major",
      "side": "left",
      "source_side": "right",
      "path_d": "M416.04 435c-15.12.11-34.46-6.78-41.37-21.48q-1.88-3.99-2.84-12.18c-2.89-24.41-5.9-53.65 8.44-74.79 4.26-6.26 10.49-7.93 18.36-8.56q11.66-.92 23.32-.35c10.58.53 18.02 2.74 26.62 7.87 12.81 7.65 19.73 14.52 22.67 29.75 4.94 25.57.24 64.14-28.21 74.97q-12.26 4.67-26.99 4.77z"
    }
  ],
  "parts": [
    {
      "shape_key": "front_right_pectoralis_upper_zone",
      "region_key": "pectoralis_upper_zone",
      "side": "right",
      "source_side": "left",
      "target_subarea": "윗가슴",
      "path_d": "M256.907454 354.93469 C257.741225 350.99245 258.866 347.3185 260.27 344.05 C265.84 331.06 286.81 319.68 300.24 318.18 C313.813333 316.673333 326.153333 316.923333 337.26 318.93 C347 320.69 353.39 334.57 355.67 343.97 C356.3882 346.9364 356.9525 349.851608 357.385936 352.73522 C327.242392 348.73522 289.060568 347.93469 256.907454 354.93469 Z"
    },
    {
      "shape_key": "front_right_pectoralis_middle_zone",
      "region_key": "pectoralis_middle_zone",
      "side": "right",
      "source_side": "left",
      "target_subarea": "가운데 가슴",
      "path_d": "M256.668724 389.59517 C254.530034 377.86781 254.684064 365.44733 256.907454 354.93469 C289.060568 347.93469 327.242392 348.73522 357.385936 352.73522 C359.36048 365.871672 358.6192 378.3524 357.34 392.03 C356.98 395.856667 356.654667 399.053467 356.364 401.6204 C326.455417 404.6204 288.571212 396.59517 256.668724 389.59517 Z"
    },
    {
      "shape_key": "front_right_pectoralis_lower_zone",
      "region_key": "pectoralis_lower_zone",
      "side": "right",
      "source_side": "left",
      "target_subarea": "아랫가슴",
      "path_d": "M356.364 401.6204 C355.928 405.4708 355.57 407.904 355.29 408.92 C348.77 432.42 317.21 438.15 297.01 433.45 C287.89 431.33 279.77 429.07 272.91 422.84 C264.3825 415.1045 259.07475 402.78845 256.668724 389.59517 C288.571212 396.59517 326.455417 404.6204 356.364 401.6204 Z"
    },
    {
      "shape_key": "front_left_pectoralis_upper_zone",
      "region_key": "pectoralis_upper_zone",
      "side": "left",
      "source_side": "right",
      "target_subarea": "윗가슴",
      "path_d": "M370.479806 353.449025 C371.87694 343.78604 374.8208 334.5832 380.27 326.55 C384.53 320.29 390.76 318.62 398.63 317.99 C406.403333 317.376667 414.176667 317.26 421.95 317.64 C432.53 318.17 439.97 320.38 448.57 325.51 C461.38 333.16 468.3 340.03 471.24 355.26 C471.487 356.5385 471.7099 357.8495 471.906936 359.187907 C439.450255 352.187907 400.907945 349.449025 370.479806 353.449025 Z"
    },
    {
      "shape_key": "front_left_pectoralis_middle_zone",
      "region_key": "pectoralis_middle_zone",
      "side": "left",
      "source_side": "right",
      "target_subarea": "가운데 가슴",
      "path_d": "M371.483742 398.388444 C369.818186 384.018531 368.347339 368.197792 370.479806 353.449025 C400.907945 349.449025 439.450255 352.187907 471.906936 359.187907 C473.404412 369.359804 473.407997 381.114759 471.143448 392.217285 C439.252342 399.217285 401.381654 401.388444 371.483742 398.388444 Z"
    },
    {
      "shape_key": "front_left_pectoralis_lower_zone",
      "region_key": "pectoralis_lower_zone",
      "side": "left",
      "source_side": "right",
      "target_subarea": "아랫가슴",
      "path_d": "M471.143448 392.217285 C467.746625 408.871074 459.2465 424.0569 443.03 430.23 C434.856667 433.343333 425.86 434.933333 416.04 435 C400.92 435.11 381.58 428.22 374.67 413.52 C373.416667 410.86 372.47 406.8 371.83 401.34 C371.7144 400.3636 371.598608 399.379472 371.483742 398.388444 C401.381654 401.388444 439.252342 399.217285 471.143448 392.217285 Z"
    }
  ],
  "context_paths": [
    {
      "shape_key": "context_biceps_left_0",
      "path_d": "M189.52 492.51c-2.43.62-7.38.57-7.51-3.08-.56-16.01-.42-35.49 5.11-50.26 3.19-8.54 13.89-30.22 23.27-32.72 10.08-2.68 12.68 16.59 12.6 22.8-.22 15.98-7.51 34.79-15.05 48.71-4.29 7.94-9.95 12.38-18.42 14.55z"
    },
    {
      "shape_key": "context_biceps_right_0",
      "path_d": "M526.69 486.31c-9.9-8.61-17.75-33.21-20.65-47.73-1.41-7.06-1.34-29.61 8.58-32.16 10.33-2.66 23.81 25.34 26.6 32.91q2.6 7.04 3.6 16.13 1.62 14.66 1.66 32.28c.03 11.04-16.45 1.48-19.79-1.43z"
    },
    {
      "shape_key": "context_neck_common_0",
      "path_d": "M362.65 290.52q-1.14-1.37-1.86-3.41-5.33-15.15-12.14-29.75c-2.37-5.06-1.07-9.07-7.92-10.99q-1.01-.28.02-.47c5.98-1.08 15.25.91 21.33 2q2.37.42 4.81-.09 10.09-2.13 20.45-2.12a.37.37 0 01.08.73c-6.34 1.46-5.45 5.64-7.57 10.21q-6.1 13.1-11 26.69-1.3 3.62-2.9 6.81a1.99 1.99 0 01-3.3.39z"
    },
    {
      "shape_key": "context_neck_left_0",
      "path_d": "M354.01 315.07q-3.49-3.65-5.9-8.23c-6.46-12.3-11.03-25.42-16.12-38.77-2.92-7.66-1.98-19.44-1.61-27.6q.03-.58.47-.21c9.06 7.39 11.33 17.46 15.67 27.62 5.4 12.61 15.4 33.31 9.11 46.92a1 .99 35.5 01-1.62.27z"
    },
    {
      "shape_key": "context_neck_left_1",
      "path_d": "M345.77 316c-4.12-1.96-12.78-6.76-15.07-11.38-4.29-8.65-2.69-16.02-2.28-25.25a1 1 0 011.95-.28c4.29 12.42 10.5 24.4 15.71 36.61q.23.55-.31.3z"
    },
    {
      "shape_key": "context_neck_right_0",
      "path_d": "M372.75 314.71c-5.78-9.67 1.71-31.17 6.17-40.68 5.95-12.68 8.21-24.68 18.35-33.9a.49.49 0 01.82.35c.28 8.68.84 19.39-1.97 27.72-5.26 15.58-11.39 33.46-21.42 46.62a1.18 1.18 0 01-1.95-.11z"
    },
    {
      "shape_key": "context_neck_right_1",
      "path_d": "M398.01 278.49a.5.49 35.5 01.87-.14c2.01 2.7 1.62 11.6 1.61 15.13-.04 12.42-8.2 17.45-17.9 22.58a.35.35 0 01-.48-.46c5.51-12.02 11.85-24.46 15.9-37.11z"
    },
    {
      "shape_key": "context_deltoids_left_0",
      "path_d": "M274.06 311.69q3.94 2.77 4.33 8.14.04.48-.38.73c-9.98 5.88-24.35 7.45-28.82 19.75-2.31 6.36-.97 17.35-1.43 23.68q-.55 7.51-5.73 14.07-10.37 13.11-13.81 16.67c-3.41 3.53-6.81 1.76-10.69-.47-15.42-8.87-24.95-25.45-22.52-43.22 2.05-14.92 12.71-25.79 24.06-35.02 16.99-13.82 35.58-17.99 54.99-4.33z"
    },
    {
      "shape_key": "context_deltoids_right_0",
      "path_d": "M450.39 320.75q-.95-.52-.7-1.58c1.57-6.61 5.8-9.1 12.14-11.9 24.99-11.03 43.76 3.33 60.17 20.74 20.73 21.99 11.81 56.44-14.82 68.19-4.41 1.94-6.79-1.03-9.81-4.51-5.81-6.7-13.46-14.12-15.99-22.8-3.93-13.43 4.32-27.54-9.64-37.62q-8.22-5.93-17.99-9.08-1.84-.59-3.36-1.44z"
    }
  ],
  "default_frequencies": {
    "pectoralis_upper_zone": 1,
    "pectoralis_middle_zone": 3,
    "pectoralis_lower_zone": 5
  },
  "target_mapping": [
    {
      "target_area": "가슴",
      "target_subarea": "윗가슴",
      "region_key": "pectoralis_upper_zone"
    },
    {
      "target_area": "가슴",
      "target_subarea": "가운데 가슴",
      "region_key": "pectoralis_middle_zone"
    },
    {
      "target_area": "가슴",
      "target_subarea": "아랫가슴",
      "region_key": "pectoralis_lower_zone"
    },
    {
      "target_area": "가슴",
      "target_subarea": "대흉근",
      "region_key": "pectoralis_major",
      "mapping_mode": "whole_muscle",
      "propagate_child_frequency": false
    },
    {
      "target_area": "가슴",
      "target_subarea": "소흉근",
      "mapping_mode": "requires_deep_view",
      "shape_keys": []
    }
  ],
  "palette": [
    "#E7E8E5",
    "#F3D7CB",
    "#EEB59C",
    "#E49069",
    "#D86D38",
    "#CF5604"
  ]
};
  const svg_namespace = 'http://www.w3.org/2000/svg';
  function deep_freeze(asset_value) {
    if (asset_value && typeof asset_value === 'object') {
      Object.values(asset_value).forEach(deep_freeze);
      Object.freeze(asset_value);
    }
    return asset_value;
  }
  deep_freeze(chest_assets);
  function validate_frequency(day_count) {
    if (!Number.isInteger(day_count) || day_count < 0 || day_count > 7) {
      throw new RangeError('운동일 수는 0부터 7까지의 정수여야 합니다.');
    }
    return day_count;
  }
  function frequency_color(day_count) {
    return chest_assets.palette[Math.min(validate_frequency(day_count), 5)];
  }
  function add_path(parent_element, path_definition, fill_color, view_prefix) {
    const path_element = document.createElementNS(svg_namespace, 'path');
    path_element.id = view_prefix + '_' + path_definition.shape_key;
    path_element.setAttribute('d', path_definition.path_d);
    path_element.setAttribute('fill', fill_color);
    path_element.setAttribute('stroke', '#292E32');
    path_element.setAttribute('stroke-width', '0.6');
    path_element.setAttribute('stroke-linejoin', 'round');
    if (path_definition.region_key) {
      path_element.dataset.shapeKey = path_definition.shape_key;
      path_element.dataset.regionKey = path_definition.region_key;
      path_element.dataset.side = path_definition.side;
    } else {
      path_element.setAttribute('pointer-events', 'none');
    }
    parent_element.appendChild(path_element);
    return path_element;
  }
  function create_chest_svg(view_type, view_prefix) {
    if (!['original', 'split'].includes(view_type)) throw new RangeError('알 수 없는 도식입니다.');
    const svg_element = document.createElementNS(svg_namespace, 'svg');
    svg_element.setAttribute('viewBox', chest_assets.view_box.join(' '));
    svg_element.setAttribute('role', 'img');
    svg_element.setAttribute('aria-label', view_type === 'original' ? '원본 가슴 좌우 두 파츠' : '가슴 상부 중부 하부 좌우 여섯 파츠');
    const title_element = document.createElementNS(svg_namespace, 'title');
    title_element.textContent = view_type === 'original' ? '원본 가슴 경로' : '세부 가슴 타겟 구역';
    svg_element.appendChild(title_element);
    const context_group = document.createElementNS(svg_namespace, 'g');
    context_group.setAttribute('opacity', '0.6');
    svg_element.appendChild(context_group);
    chest_assets.context_paths.forEach(path_definition => add_path(context_group, path_definition, '#E7E8E5', view_prefix));
    const target_group = document.createElementNS(svg_namespace, 'g');
    target_group.dataset.layerKey = 'muscle_fills';
    svg_element.appendChild(target_group);
    if (view_type === 'original') {
      chest_assets.original_parts.forEach(path_definition => add_path(target_group, path_definition, '#E7E8E5', view_prefix));
    } else {
      chest_assets.parts.forEach(path_definition => {
        const day_count = chest_assets.default_frequencies[path_definition.region_key];
        const path_element = add_path(target_group, path_definition, frequency_color(day_count), view_prefix);
        path_element.dataset.trainingDays = String(day_count);
      });
    }
    return svg_element;
  }
  function set_part_frequency(svg_element, shape_key, day_count) {
    const definition = chest_assets.parts.find(part_definition => part_definition.shape_key === shape_key);
    if (!definition) throw new RangeError('등록되지 않은 가슴 파츠입니다.');
    validate_frequency(day_count);
    const path_element = Array.from(svg_element.querySelectorAll('[data-shape-key]')).find(path_element => path_element.dataset.shapeKey === shape_key);
    if (!path_element) throw new Error('도식에 연결된 경로가 없습니다.');
    path_element.setAttribute('fill', frequency_color(day_count));
    path_element.dataset.trainingDays = String(day_count);
    return shape_key;
  }
  function apply_region_frequency(svg_element, region_key, day_count) {
    const parts = chest_assets.parts.filter(part_definition => part_definition.region_key === region_key);
    if (!parts.length) throw new RangeError('등록되지 않은 가슴 구역입니다.');
    validate_frequency(day_count);
    return parts.map(part_definition => set_part_frequency(svg_element, part_definition.shape_key, day_count));
  }
  const sample_api = Object.freeze({assets: chest_assets, create_chest_svg, frequency_color, set_part_frequency, apply_region_frequency});
  if (typeof module !== 'undefined' && module.exports) module.exports = sample_api;
  else sample_scope.chest_mapping_sample = sample_api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
