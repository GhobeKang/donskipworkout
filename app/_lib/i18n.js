import english_messages from './translations/en.json';

export const language_storage_key = 'donskipworkout.language';
let current_language = 'ko';
let initialized = false;
const language_listeners = new Set();
const korean_messages = Object.fromEntries(Object.entries(english_messages).filter(([, value]) => value).map(([key, value]) => [value, key]));
const escape_pattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const message_patterns = Object.fromEntries(['ko', 'en'].map((language) => [language,
  Object.entries(language === 'en' ? english_messages : korean_messages)
    .filter(([source]) => source.length > 8)
    .sort(([first], [second]) => second.length - first.length)
    .map(([source, target]) => {
      const parameter_indices = [...source.matchAll(/\{(\d+)\}/g)].map((match) => match[1]);
      const pattern = source.split(/\{\d+\}/).map(escape_pattern).join('(.+?)');
      return { pattern: new RegExp(pattern, 'g'), target, parameter_indices };
    }),
]));

export function get_language() {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;
    try {
      current_language = window.localStorage.getItem(language_storage_key) === 'en' ? 'en' : 'ko';
    } catch { /* Keep an in-memory preference when storage is unavailable. */ }
  }
  return current_language;
}

export function set_language(language) {
  if (!['ko', 'en'].includes(language)) return false;
  initialized = true;
  current_language = language;
  let persisted = true;
  try { window.localStorage.setItem(language_storage_key, language); }
  catch { persisted = false; }
  language_listeners.forEach((listener) => listener());
  return persisted;
}

export function subscribe_language(listener) {
  language_listeners.add(listener);
  const on_storage = (event) => {
    if (event.key !== language_storage_key && event.key !== null) return;
    current_language = event.newValue === 'en' ? 'en' : 'ko';
    listener();
  };
  window.addEventListener('storage', on_storage);
  return () => {
    language_listeners.delete(listener);
    window.removeEventListener('storage', on_storage);
  };
}

export function translate(message, parameters = [], language = get_language()) {
  if (typeof message !== 'string') return message;
  const template = language === 'en' ? (english_messages[message] ?? message) : message;
  return template.replace(/\{(\d+)\}/g, (placeholder, index) => parameters[index] ?? placeholder);
}

// Only use for application-owned status/error text, never user notes or names.
export function translate_message(message, language = get_language()) {
  if (!message || typeof message !== 'string') return message;
  const messages = language === 'en' ? english_messages : korean_messages;
  if (Object.hasOwn(messages, message)) return messages[message];
  let result = message;
  for (const { pattern, target, parameter_indices } of message_patterns[language]) {
    result = result.replace(pattern, (...matches) => target.replace(/\{(\d+)\}/g,
      (placeholder, index) => matches[parameter_indices.indexOf(index) + 1] ?? placeholder));
  }
  return result;
}

export function exercise_label(exercise, language = get_language()) {
  const name = exercise?.name || exercise?.exercise_name || '';
  return exercise?.exercise_source === 'shared' ? translate(name, [], language) : name;
}

export function format_workout_date(workout_date, language = get_language(), options = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { ...options, timeZone: 'UTC' })
    .format(new Date(`${workout_date}T12:00:00Z`));
}

export function localize_data(value, language, field_name = '') {
  if (Array.isArray(value)) return value.map((item) => localize_data(item, language, field_name));
  if (!value || typeof value !== 'object') {
    return ['status', 'hero_quote', 'progress_message', 'roast_labels', 'roast_quotes', 'day_names', 'label'].includes(field_name)
      ? translate(value, [], language) : value;
  }
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    localize_data(item, language, ['roast_labels', 'roast_quotes'].includes(field_name) ? field_name : key),
  ]));
  if (value.workout_date && value.session_status) {
    result.date = format_workout_date(value.workout_date, language);
    result.title = value.note && value.title === value.note ? value.title : translate(value.title, [], language);
  }
  return result;
}
