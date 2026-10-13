import { SqliteValue } from "@powersync/common";

import { money } from "../../sell/domain/decimal";
import { parseSqlTimestamp } from "../domain/sale-date-range";
import { SaleRegisterPersistenceError } from "../sales.errors";

/** Strict SQLite -> domain converters: corrupt local rows fail loudly instead of rendering garbage. */
export function requiredText(value: SqliteValue | undefined, column: string): string {
  if (typeof value !== "string" || value === "") {
    throw new SaleRegisterPersistenceError(`Missing ${column} in local sales data.`);
  }
  return value;
}

export function nullableText(value: SqliteValue | undefined, column: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SaleRegisterPersistenceError(`Invalid ${column} in local sales data.`);
  }
  return value;
}

export function requiredMoney(value: SqliteValue | undefined, column: string): string {
  try {
    return money(typeof value === "number" ? value : requiredText(value, column));
  } catch (error) {
    if (error instanceof SaleRegisterPersistenceError) {
      throw error;
    }
    throw new SaleRegisterPersistenceError(`Invalid ${column} in local sales data.`);
  }
}

export function requiredDecimal(value: SqliteValue | undefined, column: string): string {
  if (typeof value === "number") {
    return String(value);
  }
  const text = requiredText(value, column);
  if (!/^-?\d+(\.\d+)?$/.test(text.trim())) {
    throw new SaleRegisterPersistenceError(`Invalid ${column} in local sales data.`);
  }
  return text.trim();
}

export function requiredDate(value: SqliteValue | undefined, column: string): Date {
  const date = parseSqlTimestamp(requiredText(value, column));
  if (!date) {
    throw new SaleRegisterPersistenceError(`Invalid ${column} in local sales data.`);
  }
  return date;
}

export function nullableDate(value: SqliteValue | undefined): Date | null {
  return typeof value === "string" ? parseSqlTimestamp(value) : null;
}

export function oneOf<T extends string>(
  value: SqliteValue | undefined,
  allowed: readonly T[],
  column: string,
): T {
  const text = requiredText(value, column);
  if (!(allowed as readonly string[]).includes(text)) {
    throw new SaleRegisterPersistenceError(`Unexpected ${column} "${text}" in local sales data.`);
  }
  return text as T;
}

export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}
