import { useEffect, useState } from 'react';
import { api_request } from '../../_lib/api';

export default function PhotoFrame({ catalog, frame, className = '' }) {
  const [frame_image_url, set_frame_image_url] = useState('');

  useEffect(() => {
    if (!frame.image_url) {
      set_frame_image_url('');
      return undefined;
    }
    const controller = new AbortController();
    let object_url = '';
    api_request(frame.image_url, { signal: controller.signal, response_type: 'blob' }).then((frame_blob) => {
      if (controller.signal.aborted) return;
      object_url = URL.createObjectURL(frame_blob);
      set_frame_image_url(object_url);
    }).catch(() => {});
    return () => { controller.abort(); if (object_url) URL.revokeObjectURL(object_url); };
  }, [frame.image_url]);

  if (frame.image_url) return frame_image_url
    ? <img className={className} src={frame_image_url} alt="" aria-hidden="true" />
    : null;
  return <svg className={className} viewBox={`0 0 ${catalog.width} ${catalog.height}`} aria-hidden="true">
    {frame.shapes.map((shape, shape_index) => <rect key={shape_index} x={shape.box[0]} y={shape.box[1]} width={shape.box[2]} height={shape.box[3]} fill={shape.color} />)}
  </svg>;
}
