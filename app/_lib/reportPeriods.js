export function report_today(timezone = 'Asia/Seoul') {
  const date_parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const date_part = (type) => date_parts.find((part) => part.type === type).value;
  return `${date_part('year')}-${date_part('month')}-${date_part('day')}`;
}

function date_string(date) {
  return date.toISOString().slice(0, 10);
}

export function report_year(period_type, today) {
  const date = new Date(`${today}T00:00:00Z`);
  if (period_type === 'weekly') date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  return date.getUTCFullYear();
}

export function report_period_choices(period_type, year, today) {
  if (period_type === 'monthly') {
    return Array.from({ length: 12 }, (_, index) => {
      const start = `${year}-${String(index + 1).padStart(2, '0')}-01`;
      return { start, end: date_string(new Date(Date.UTC(year, index + 1, 0))), number: index + 1 };
    }).filter((period) => period.start <= today).reverse();
  }
  const first_week = new Date(Date.UTC(year, 0, 4));
  first_week.setUTCDate(first_week.getUTCDate() - (first_week.getUTCDay() + 6) % 7);
  const choices = [];
  for (let week_number = 1; week_number <= 53; week_number += 1) {
    const start = new Date(first_week);
    start.setUTCDate(start.getUTCDate() + (week_number - 1) * 7);
    if (report_year('weekly', date_string(start)) !== year || date_string(start) > today) break;
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    choices.push({ start: date_string(start), end: date_string(end), number: week_number });
  }
  return choices.reverse();
}
