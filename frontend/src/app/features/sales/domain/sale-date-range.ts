import { DatePreset, SoldAtRange } from "../models/sale-register.model";

/**
 * `sold_at` arrives in two shapes: rows written on this device are ISO strings with a `Z`, rows synced
 * down from Postgres are zone-less `YYYY-MM-DD HH:MM:SS[.fff]` values recorded in UTC. SQLite's
 * `datetime()` normalises both, so filters compare against UTC bounds in the same format.
 */
export function toSqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Parses either `sold_at` shape; zone-less values are UTC. */
export function parseSqlTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const text = value.trim().replace(" ", "T");
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Turns a local-calendar preset into UTC `[from, to)` bounds. */
export function resolveSoldAtRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
  now: Date = new Date(),
): SoldAtRange {
  const today = startOfLocalDay(now);
  switch (preset) {
    case "today":
      return bounds(today, addDays(today, 1));
    case "yesterday":
      return bounds(addDays(today, -1), today);
    case "last7":
      return bounds(addDays(today, -6), addDays(today, 1));
    case "thisMonth":
      return bounds(
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 1),
      );
    case "lastMonth":
      return bounds(
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
        new Date(today.getFullYear(), today.getMonth(), 1),
      );
    case "custom":
      return customRange(customFrom, customTo);
    case "all":
    default:
      return { from: null, to: null };
  }
}

/** Parses a `YYYY-MM-DD` filter value as a local calendar day. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

function customRange(fromText: string, toText: string): SoldAtRange {
  let from = parseLocalDate(fromText);
  let to = parseLocalDate(toText);
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  return {
    from: from ? toSqliteUtc(from) : null,
    to: to ? toSqliteUtc(addDays(to, 1)) : null,
  };
}

function bounds(from: Date, to: Date): SoldAtRange {
  return { from: toSqliteUtc(from), to: toSqliteUtc(to) };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
