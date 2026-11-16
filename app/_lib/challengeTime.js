export function get_challenge_timezone(round_data) {
  return round_data?.timezone || round_data?.rulebook?.timezone || 'Asia/Seoul';
}

export function next_challenge_start_date(timezone = 'Asia/Seoul', current_time = new Date()) {
  const date_parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(current_time);
  const date_part = (type) => Number(date_parts.find((part) => part.type === type).value);
  const next_date = new Date(Date.UTC(date_part('year'), date_part('month') - 1, date_part('day') + 1));
  return next_date.toISOString().slice(0, 10);
}
