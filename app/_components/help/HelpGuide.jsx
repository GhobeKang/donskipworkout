import { useEffect, useId, useRef, useState } from 'react';
import { useLanguage } from '../../_hooks/useLanguage';
import { help_categories, help_questions } from '../../_lib/helpGuide';
import MaterialIcon from '../ui/MaterialIcon';
import help_styles from './Help.module.css';

export default function HelpGuide({ question_id, on_close, on_navigate, navigation_pending }) {
  const { t } = useLanguage();
  const initial_question = help_questions.find((question) => question.question_id === question_id);
  const [focused_question_id, set_focused_question_id] = useState(initial_question?.question_id || null);
  const [selected_category, set_selected_category] = useState('all');
  const [open_question_id, set_open_question_id] = useState(initial_question?.question_id || null);
  const [navigation_error, set_navigation_error] = useState('');
  const dialog_ref = useRef(null);
  const title_id = useId();
  const question_prefix = useId();
  const dialog_title = focused_question_id ? t('기능 도움말') : t('사용 가이드');
  const visible_questions = focused_question_id
    ? help_questions.filter((question) => question.question_id === focused_question_id)
    : help_questions.filter((question) => selected_category === 'all' || question.category_id === selected_category);

  useEffect(() => {
    const dialog_element = dialog_ref.current;
    const previously_focused = document.activeElement;
    const previous_overflow = document.body.style.overflow;
    dialog_element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog_element.close();
      document.body.style.overflow = previous_overflow;
      if (previously_focused?.isConnected) previously_focused.focus({ preventScroll: true });
    };
  }, []);

  const show_question = (next_question_id) => {
    set_focused_question_id(next_question_id);
    set_open_question_id(next_question_id);
    set_navigation_error('');
    dialog_ref.current.scrollTop = 0;
  };
  const navigate_to_feature = async (view) => {
    set_navigation_error('');
    if (await on_navigate(view) === false) {
      set_navigation_error(t('화면을 열지 못했습니다. 도움말을 닫고 현재 화면의 안내를 확인해 주세요.'));
    }
  };

  return <dialog ref={dialog_ref} className={help_styles.guideDialog} aria-labelledby={title_id}
    onCancel={(event) => { event.preventDefault(); if (!navigation_pending) on_close(); }}>
    <header className={help_styles.dialogHeader}>
      <h2 id={title_id}>{dialog_title}</h2>
      <button type="button" className="quietButton" disabled={navigation_pending} aria-label={t('도움말 닫기')} onClick={on_close}><MaterialIcon>close</MaterialIcon></button>
    </header>
    <div className={help_styles.dialogBody}>
      {focused_question_id ? <button type="button" className={help_styles.helpLink} onClick={() => { set_selected_category('all'); show_question(null); }}>
        <MaterialIcon>arrow_back</MaterialIcon>{t('전체 사용 가이드 보기')}
      </button> : <>
        <article className={help_styles.starterCard}>
          <h3>{t('처음이라면 여기부터')}</h3>
          <p>{t('출석부터 한 번 남겨 보세요. 세트 기록과 시간 측정은 별도로 이용할 수 있어요.')}</p>
          <button type="button" className={help_styles.helpLink} onClick={() => show_question('first-checkin')}><MaterialIcon>arrow_forward</MaterialIcon>{t('첫 출석 방법 보기')}</button>
        </article>
        <section aria-labelledby={`${title_id}-featured`}>
          <h3 id={`${title_id}-featured`} className={help_styles.sectionTitle}>{t('먼저 확인해 보세요')}</h3>
          <div className={help_styles.featuredQuestions}>{help_questions.filter((question) => question.featured && question.question_id !== 'first-checkin').map((question) =>
            <button type="button" key={question.question_id} className={help_styles.questionShortcut} onClick={() => show_question(question.question_id)}>{t(question.question)}<MaterialIcon>chevron_right</MaterialIcon></button>)}</div>
        </section>
        <section aria-labelledby={`${title_id}-categories`}>
          <h3 id={`${title_id}-categories`} className={help_styles.sectionTitle}>{t('주제별 질문')}</h3>
          <div className={help_styles.categoryList} role="group" aria-label={t('도움말 주제')}>
            {help_categories.map((category) => <button type="button" key={category.category_id} className={help_styles.categoryButton}
              aria-pressed={selected_category === category.category_id} onClick={() => { set_selected_category(category.category_id); set_open_question_id(null); }}>
              {t(category.label)}
            </button>)}
          </div>
        </section>
      </>}
      <div className={help_styles.questionList}>
        {visible_questions.map((question) => {
          const is_open = open_question_id === question.question_id;
          const answer_id = `${question_prefix}-${question.question_id}`;
          return <section className={help_styles.questionItem} key={question.question_id}>
            <h3><button type="button" className={help_styles.questionButton} aria-expanded={is_open} aria-controls={answer_id}
              id={`${answer_id}-question`} onClick={() => set_open_question_id(is_open ? null : question.question_id)}>
              <span>{t(question.question)}</span><MaterialIcon>{is_open ? 'remove' : 'add'}</MaterialIcon>
            </button></h3>
            <div className={help_styles.answerBody} id={answer_id} role="region" aria-labelledby={`${answer_id}-question`} hidden={!is_open}>
              <p className={help_styles.answerSummary}>{t(question.answer)}</p>
              {question.steps && <ol>{question.steps.map((step) => <li key={step}>{t(step)}</li>)}</ol>}
              {question.note && <p className={help_styles.answerNote}>{t(question.note)}</p>}
              <button type="button" className="wideButton secondary" disabled={navigation_pending} onClick={() => navigate_to_feature(question.action.view)}>
                {t(question.action.label)}<MaterialIcon>arrow_forward</MaterialIcon>
              </button>
            </div>
          </section>;
        })}
      </div>
      {navigation_error && <p className="errorText" role="alert">{navigation_error}</p>}
      <footer className={help_styles.guideFooter}>
        <p>{t('설명과 화면이 다르면 도움말을 닫고 현재 화면의 저장 상태나 오류 안내를 먼저 확인해 주세요.')}</p>
        <a className={help_styles.helpLink} href="mailto:sayudogu@gmail.com">{t('해결되지 않았나요? 문의하기')}</a>
        <button type="button" className="textButton" disabled={navigation_pending} onClick={on_close}>{t('하던 화면으로 돌아가기')}</button>
      </footer>
    </div>
  </dialog>;
}
