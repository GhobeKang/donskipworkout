import { useLanguage } from '../../_hooks/useLanguage';
export default function RequestState({ loading, error, on_retry }) {
  const { t, localize_message } = useLanguage();
  if (error) return <div className="requestState" role="alert">
    <p>{localize_message(error)}</p>
    {on_retry && <button type="button" className="textButton" onClick={on_retry}>{t("다시 불러오기")}</button>}
  </div>;
  if (loading) return <p className="requestState" role="status">{t("불러오는 중…")}</p>;
  return null;
}
