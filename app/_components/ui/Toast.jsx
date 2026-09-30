import { useLanguage } from '../../_hooks/useLanguage';
export default function Toast({ message }) {
  const { localize_message } = useLanguage();
  if (!message) return null;
  return <div className="toast isVisible" role="status" aria-live="polite">{localize_message(message)}</div>;
}
