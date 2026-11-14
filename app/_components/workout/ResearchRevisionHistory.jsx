import { useState } from 'react';
import useApiResource from '../../_hooks/useApiResource';
import { useLanguage } from '../../_hooks/useLanguage';
import RequestState from '../ui/RequestState';

function RevisionList({ path, on_unauthorized }) {
  const { t, language } = useLanguage();
  const [retry_count, set_retry_count] = useState(0);
  const resource = useApiResource(path, retry_count, on_unauthorized);
  return <div>
    <RequestState loading={resource.loading} error={resource.error} on_retry={retry_count < 2 ? () => set_retry_count((value) => value + 1) : undefined} />
    {resource.data && !resource.error && <>
      <p className="infoText">{t('최근 수정 이력은 최대 20개까지 표시됩니다.')}</p>
      {resource.data.revisions.map((revision) => <article key={revision.revision}>
        <p className="infoText">v{revision.revision} · {revision.editor_name} · {new Date(revision.created_at).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR')}</p>
        <strong>{t('수정 전')}</strong><p className="exerciseResearchContent">{revision.previous_content}</p>
        <strong>{t('수정 후')}</strong><p className="exerciseResearchContent">{revision.content}</p>
      </article>)}
      {resource.data.revisions.length === 0 && <p className="infoText">{t('수정 이력이 없습니다.')}</p>}
    </>}
  </div>;
}

export default function ResearchRevisionHistory({ path, revision, on_unauthorized }) {
  const { t } = useLanguage();
  const [is_open, set_is_open] = useState(false);
  return <details onToggle={(event) => set_is_open(event.currentTarget.open)}>
    <summary>{t('수정 이력')}</summary>
    {is_open && <RevisionList key={revision} path={path} on_unauthorized={on_unauthorized} />}
  </details>;
}
