'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../_hooks/useLanguage';
import MaterialIcon from './MaterialIcon';

export default function InfoTooltip({ children, label = '', description_id }) {
  const { t } = useLanguage();
  const tooltip_id = useId();
  const help_id = description_id || `${tooltip_id}-description`;
  const trigger_ref = useRef(null);
  const tooltip_ref = useRef(null);
  const close_timer_ref = useRef(null);
  const pinned_ref = useRef(false);
  const [is_open, set_is_open] = useState(false);
  const [position, set_position] = useState(null);

  const cancel_close = useCallback(() => clearTimeout(close_timer_ref.current), []);
  const close_tooltip = useCallback(() => {
    cancel_close();
    pinned_ref.current = false;
    set_is_open(false);
    set_position(null);
  }, [cancel_close]);
  const schedule_close = () => {
    cancel_close();
    if (pinned_ref.current || trigger_ref.current?.matches(':focus-visible')) return;
    close_timer_ref.current = setTimeout(close_tooltip, 150);
  };

  useEffect(() => () => clearTimeout(close_timer_ref.current), []);

  useLayoutEffect(() => {
    if (!is_open) return;
    const place_tooltip = () => {
      const viewport = window.visualViewport;
      const viewport_left = viewport?.offsetLeft || 0;
      const viewport_top = viewport?.offsetTop || 0;
      const viewport_width = viewport?.width || window.innerWidth;
      const viewport_height = viewport?.height || window.innerHeight;
      const trigger_bounds = trigger_ref.current.getBoundingClientRect();
      const tooltip_width = Math.min(320, viewport_width - 24);
      const space_below = viewport_top + viewport_height - trigger_bounds.bottom - 20;
      const space_above = trigger_bounds.top - viewport_top - 20;
      const tooltip_height = tooltip_ref.current.scrollHeight;
      const show_below = tooltip_height <= space_below || space_below >= space_above;
      const max_height = Math.max(44, show_below ? space_below : space_above);
      set_position({
        left: Math.max(viewport_left + 12, Math.min(trigger_bounds.left + trigger_bounds.width / 2 - tooltip_width / 2, viewport_left + viewport_width - tooltip_width - 12)),
        top: show_below ? trigger_bounds.bottom + 8 : Math.max(viewport_top + 12, trigger_bounds.top - Math.min(tooltip_height, max_height) - 8),
        width: tooltip_width,
        maxHeight: max_height,
      });
    };
    place_tooltip();
    window.addEventListener('resize', place_tooltip);
    window.visualViewport?.addEventListener('resize', place_tooltip);
    return () => {
      window.removeEventListener('resize', place_tooltip);
      window.visualViewport?.removeEventListener('resize', place_tooltip);
    };
  }, [is_open, children]);

  useEffect(() => {
    if (!is_open) return;
    const close_outside = (event) => {
      if (!trigger_ref.current?.contains(event.target) && !tooltip_ref.current?.contains(event.target)) close_tooltip();
    };
    const close_on_escape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close_tooltip();
    };
    const close_on_scroll = (event) => {
      if (!tooltip_ref.current?.contains(event.target)) close_tooltip();
    };
    document.addEventListener('pointerdown', close_outside, true);
    document.addEventListener('focusin', close_outside, true);
    document.addEventListener('keydown', close_on_escape, true);
    document.addEventListener('scroll', close_on_scroll, true);
    window.visualViewport?.addEventListener('scroll', close_tooltip);
    return () => {
      document.removeEventListener('pointerdown', close_outside, true);
      document.removeEventListener('focusin', close_outside, true);
      document.removeEventListener('keydown', close_on_escape, true);
      document.removeEventListener('scroll', close_on_scroll, true);
      window.visualViewport?.removeEventListener('scroll', close_tooltip);
    };
  }, [is_open, close_tooltip]);

  return <span className="infoTooltip">
    <button ref={trigger_ref} className="infoTooltipTrigger" type="button"
      aria-label={label ? `${label} ${t('설명 보기')}` : t('설명 보기')}
      aria-describedby={is_open ? tooltip_id : help_id} aria-expanded={is_open}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') { cancel_close(); set_is_open(true); } }}
      onPointerLeave={schedule_close}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) { cancel_close(); set_is_open(true); } }}
      onBlur={() => { if (!pinned_ref.current) close_tooltip(); }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        cancel_close();
        if (pinned_ref.current) close_tooltip();
        else { pinned_ref.current = true; set_is_open(true); }
      }}><MaterialIcon>info</MaterialIcon></button>
    <span id={help_id} className="srOnly" aria-hidden="true">{children}</span>
    {is_open && createPortal(<span ref={tooltip_ref} id={tooltip_id} role="tooltip" className="infoTooltipContent"
      style={position || { visibility: 'hidden', width: 'min(320px, calc(100vw - 24px))' }}
      onPointerEnter={cancel_close} onPointerLeave={schedule_close}>{children}</span>, trigger_ref.current?.closest('dialog') || document.body)}
  </span>;
}
