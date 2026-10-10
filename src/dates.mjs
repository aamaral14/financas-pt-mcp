// Date helpers. All dates are local calendar dates as 'YYYY-MM-DD' strings.
// CI gate check (temporary)

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseYmd = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Invalid date '${s}', expected YYYY-MM-DD`);
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  if (dt.getMonth() !== m - 1) throw new Error(`Invalid date '${s}'`);
  return dt;
};

export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12);
}

/** Portuguese national public holidays (no municipal holidays, no Carnival). */
export function holidaysPT(y) {
  const e = easterSunday(y);
  const rel = (n) => { const d = new Date(e); d.setDate(d.getDate() + n); return ymd(d); };
  return new Set([
    `${y}-01-01`, `${y}-04-25`, `${y}-05-01`, `${y}-06-10`, `${y}-08-15`,
    `${y}-10-05`, `${y}-11-01`, `${y}-12-01`, `${y}-12-08`, `${y}-12-25`,
    rel(-2), rel(0), rel(60), // Good Friday, Easter, Corpus Christi
  ]);
}

export const isBusinessDayPT = (d) =>
  d.getDay() !== 0 && d.getDay() !== 6 && !holidaysPT(d.getFullYear()).has(ymd(d));

/** Last business day of a month (month is 1-12). */
export function lastBusinessDayPT(year, month) {
  const d = new Date(year, month, 0, 12);
  while (!isBusinessDayPT(d)) d.setDate(d.getDate() - 1);
  return ymd(d);
}

/** Split [from, to] into windows of at most 12 months (portal limit). */
export function twelveMonthWindows(from, to) {
  const start = parseYmd(from), end = parseYmd(to);
  if (start > end) throw new Error(`'from' (${from}) is after 'to' (${to})`);
  const out = [];
  let cur = new Date(start);
  while (cur <= end) {
    const winEnd = new Date(cur);
    winEnd.setFullYear(winEnd.getFullYear() + 1);
    winEnd.setDate(winEnd.getDate() - 1);
    const e = winEnd < end ? winEnd : end;
    out.push([ymd(cur), ymd(e)]);
    cur = new Date(e);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
