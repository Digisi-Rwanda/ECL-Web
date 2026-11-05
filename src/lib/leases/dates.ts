/** Calendar dates as ISO "YYYY-MM-DD" strings, computed in UTC so no timezone can shift a day. */
export type ISODate = string;

const MS = 86_400_000;
const re = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !re.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function toUTC(d: ISODate): number {
  return Date.parse(d + "T00:00:00Z");
}
export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * MS);
}
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / MS);
}
export function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
/** Add months keeping end-of-month: 31 Jan + 1m = 28/29 Feb; anchorDay keeps 31 → 31 Mar later. */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = daysInMonth(t.getUTCFullYear(), t.getUTCMonth());
  t.setUTCDate(Math.min(anchorDay ?? day, dim));
  return fromUTC(t.getTime());
}
export function endOfMonth(d: ISODate): ISODate {
  const [y, m] = d.split("-").map(Number);
  return fromUTC(Date.UTC(y, m - 1, daysInMonth(y, m - 1)));
}
export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}
export function monthEnd(key: string): ISODate {
  return endOfMonth(key + "-01");
}
export function nextMonthKey(key: string): string {
  return monthKey(addMonths(key + "-01", 1));
}
export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
/**
 * Fractional months from a to b: whole months while a+k months <= b, then the remaining days
 * as a fraction of the following month. 1 Jan → 1 Feb = 1; 1 Jan → 1 Jan next year = 12.
 */
export function monthsBetween(a: ISODate, b: ISODate): number {
  if (b < a) return -monthsBetween(b, a);
  const day = Number(a.slice(8));
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  let k = (by - ay) * 12 + (bm - am);
  if (addMonths(a, k, day) > b) k--;
  const from = addMonths(a, k, day);
  const to = addMonths(a, k + 1, day);
  return k + daysBetween(from, b) / daysBetween(from, to);
}
