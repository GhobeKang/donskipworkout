import { useLanguage } from '../../_hooks/useLanguage';
import { useEffect, useState } from 'react';

const country_codes = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
  CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM
  JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP
  MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
  QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN
  TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/);

export default function CountryTimezoneFields({ country_code, timezone, on_change }) {
  const { t, language } = useLanguage();
  const [country_options, set_country_options] = useState([]);
  const [timezone_options, set_timezone_options] = useState([]);

  useEffect(() => {
    const locale = language === 'en' ? 'en' : 'ko';
    const country_names = new Intl.DisplayNames([locale], { type: 'region' });
    set_country_options(country_codes
      .map((code) => ({ code, name: country_names.of(code) }))
      .filter(({ code, name }) => name && name !== code)
      .sort((first, second) => first.name.localeCompare(second.name, locale)));
    const available_timezones = Intl.supportedValuesOf?.('timeZone') || [];
    set_timezone_options([...new Set(['UTC', 'Asia/Seoul', timezone, ...available_timezones].filter(Boolean))].sort());
  }, [language, timezone]);

  return <div className="localeFields">
    <label>{t('국가 (선택)')}
      <select name="country_code" value={country_code || ''} onChange={(event) => on_change('country_code', event.target.value || null)}>
        <option value="">{t('선택 안 함')}</option>
        {country_options.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
    <label>{t('시간대')}
      <select name="timezone" required value={timezone || ''} onChange={(event) => on_change('timezone', event.target.value)}>
        {timezone_options.map((time_zone) => <option key={time_zone} value={time_zone}>{time_zone}</option>)}
      </select>
    </label>
  </div>;
}
