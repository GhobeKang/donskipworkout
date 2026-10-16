import { useLanguage } from '../../_hooks/useLanguage';
import LanguageSelector from '../settings/LanguageSelector';
import { useEffect, useState } from 'react';
import CountryTimezoneFields from '../settings/CountryTimezoneFields';
import CommunityPolicy, { LegalDocuments } from '../legal/CommunityPolicy';

export default function AuthScreen({ on_authenticate, pending, error, on_clear_error }) {
  const { t, localize_message } = useLanguage();
  const [auth_mode, set_auth_mode] = useState('login');
  const [email, set_email] = useState('');
  const [password, set_password] = useState('');
  const [display_name, set_display_name] = useState('');
  const [country_code, set_country_code] = useState('');
  const [timezone, set_timezone] = useState('Asia/Seoul');
  const [accepted_policy_version, set_accepted_policy_version] = useState('');
  const is_register = auth_mode === 'register';

  useEffect(() => {
    set_timezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul');
  }, []);

  const submit_form = (event) => {
    event.preventDefault();
    on_authenticate(auth_mode, {
      email: email.trim(), password,
      ...(is_register ? { display_name: display_name.trim(), country_code, timezone, accepted_policy_version } : {}),
    });
  };

  return <section className="viewPanel isVisible authScreen">
    <header className="pageHeader"><div><p className="eyebrow">{t('운동은 꾸준한게 답이야.')}</p><h1>{t('내일부터?\n내일의 너도 하기 싫을껄?')}</h1><p className="infoText">{t('오늘도 성장할 수 있도록 귀찮게 해줄게.')}</p></div></header>
    <form className="settingsCard authForm" onSubmit={submit_form}>
      <h2>{is_register ? t("회원가입") : t("로그인")}</h2>
      <fieldset disabled={pending}>
        {is_register && <label>{t("이름")}<input name="display_name" autoComplete="nickname" required maxLength={100} value={display_name} onChange={(event) => set_display_name(event.target.value)} /></label>}
        {is_register && <CountryTimezoneFields country_code={country_code} timezone={timezone} on_change={(field_name, value) => {
          if (field_name === 'country_code') set_country_code(value);
          else set_timezone(value);
        }} />}
        <label>{t("이메일")}<input name="email" type="email" autoComplete="username" required maxLength={255} value={email} onChange={(event) => set_email(event.target.value)} /></label>
        <label>{t("비밀번호")}<input name="password" type="password" autoComplete={is_register ? 'new-password' : 'current-password'} required minLength={is_register ? 12 : 1} maxLength={128} value={password} onChange={(event) => set_password(event.target.value)} /></label>
        {is_register && <p className="infoText">{t("비밀번호는 12~128자로 입력해 주세요.")}</p>}
        {is_register && <CommunityPolicy show_agreement accepted_version={accepted_policy_version} on_change={set_accepted_policy_version} disabled={pending} />}
        {error && <p className="errorText" role="alert">{localize_message(error)}</p>}
        <button className="wideButton primary" type="submit" disabled={is_register && !accepted_policy_version}>{pending ? t("확인 중…") : is_register ? t("계정 만들기") : t("로그인")}</button>
        <button className="textButton" type="button" onClick={() => {
          set_auth_mode(is_register ? 'login' : 'register');
          set_password('');
          on_clear_error();
        }}>{is_register ? t("로그인") : t("회원가입")}</button>
      </fieldset>
    </form>
    <LanguageSelector />
    <LegalDocuments />
  </section>;
}
