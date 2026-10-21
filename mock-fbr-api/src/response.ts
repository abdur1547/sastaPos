import { randomInt } from "node:crypto";

/** Response envelope exactly as shown in section 2.6 of the FBR technical specification. */
export interface FbrPostInvoiceResponse {
  $id: string;
  version: string;
  statusCode: number;
  errorMessage: string;
  result: string;
  timestamp: string;
  errors: {
    $id: string;
    $values: string[];
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomDigits(length: number): string {
  let digits = "";
  for (let i = 0; i < length; i += 1) {
    digits += randomInt(0, 10).toString();
  }
  return digits;
}

function randomLetters(length: number): string {
  let letters = "";
  for (let i = 0; i < length; i += 1) {
    letters += LETTERS[randomInt(0, LETTERS.length)];
  }
  return letters;
}

/** Mimics the documented sample tracking number shape, e.g. `900005CLNP5914173522`. */
export function generateTrackingNumber(): string {
  return `${randomDigits(6)}${randomLetters(4)}${randomDigits(10)}`;
}

/** Mimics the documented timestamp shape, e.g. `2023-12-20T16:59:15.4831026+05:00` (7 fractional digits). */
export function formatTimestamp(date: Date, offsetMinutes = 300): string {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const pad = (value: number, width = 2) => value.toString().padStart(width, "0");
  const fraction = `${pad(local.getUTCMilliseconds(), 3)}0000`;
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}.${fraction}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

export function buildSuccessResponse(now = new Date()): FbrPostInvoiceResponse {
  return {
    $id: "1",
    version: "1.0",
    statusCode: 200,
    errorMessage: "",
    result: generateTrackingNumber(),
    timestamp: formatTimestamp(now),
    errors: {
      $id: "2",
      $values: [],
    },
  };
}
