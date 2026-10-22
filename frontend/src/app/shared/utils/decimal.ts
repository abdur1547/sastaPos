/**
 * Shared exact decimal helpers on scaled BigInts. They reproduce the backend's
 * `BigDecimal` + `RoundingMode.HALF_UP` arithmetic without floating-point drift.
 */

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Parses a decimal string/number into an integer scaled by `10^scale`, rounding half away from zero. */
export function toScaled(value: string | number, scale: number): bigint {
  const text =
    typeof value === "number" ? value.toFixed(scale + 6) : value.trim();
  if (!DECIMAL_PATTERN.test(text)) {
    throw new Error(`"${String(value)}" is not a valid decimal number.`);
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const padded = fraction.padEnd(scale + 1, "0");
  const kept = BigInt(whole + padded.slice(0, scale));
  const roundUp = padded.charCodeAt(scale) >= 53; // digit 5-9
  const magnitude = roundUp ? kept + 1n : kept;
  return negative ? -magnitude : magnitude;
}

export function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  const text = scale === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** Integer division rounding half away from zero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

/** Normalizes any decimal input to a 2-decimal string, e.g. `12` -> `12.00`. */
export function money(value: string | number): string {
  return fromScaled(toScaled(value, 2), 2);
}
