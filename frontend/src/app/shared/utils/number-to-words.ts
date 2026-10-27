/**
 * Converts numbers and currency amounts into spoken English words.
 * Formats Pakistani Rupees (Rs) and Paisas for financial accounting.
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const SCALES = [
  { value: 1000000000000000n, label: "Quadrillion" },
  { value: 1000000000000n, label: "Trillion" },
  { value: 1000000000n, label: "Billion" },
  { value: 1000000n, label: "Million" },
  { value: 1000n, label: "Thousand" },
];

function convertThreeDigit(num: number): string {
  let result = "";
  const hundred = Math.floor(num / 100);
  const remainder = num % 100;

  if (hundred > 0) {
    result += `${ONES[hundred]} Hundred`;
    if (remainder > 0) {
      result += " ";
    }
  }

  if (remainder > 0) {
    if (remainder < 20) {
      result += ONES[remainder];
    } else {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      result += TENS[ten];
      if (one > 0) {
        result += ` ${ONES[one]}`;
      }
    }
  }

  return result;
}

/**
 * Converts an integer BigInt to words.
 */
export function integerToWords(num: bigint): string {
  if (num === 0n) {
    return "Zero";
  }

  const isNegative = num < 0n;
  let remaining = isNegative ? -num : num;
  const parts: string[] = [];

  for (const scale of SCALES) {
    if (remaining >= scale.value) {
      const count = remaining / scale.value;
      remaining = remaining % scale.value;
      parts.push(`${integerToWords(count)} ${scale.label}`);
    }
  }

  if (remaining > 0n) {
    parts.push(convertThreeDigit(Number(remaining)));
  }

  const words = parts.join(" ");
  return isNegative ? `Minus ${words}` : words;
}

/**
 * Converts a decimal amount string into currency words (Rupees and Paisas).
 * E.g. "1500.50" -> "One Thousand Five Hundred Rupees and Fifty Paisas"
 *      "100.00"  -> "One Hundred Rupees"
 *      "0"       -> "Zero Rupees"
 */
export function currencyToWords(amountStr: string | number): string {
  const normalized = typeof amountStr === "number" ? amountStr.toFixed(2) : amountStr.trim();
  const isNegative = normalized.startsWith("-");
  const clean = isNegative ? normalized.slice(1) : normalized;
  const [wholeStr, fractionStr = ""] = clean.split(".");

  const whole = BigInt(wholeStr || "0");
  const fractionDigits = (fractionStr + "00").slice(0, 2);
  const paisas = parseInt(fractionDigits, 10);

  const wholeWords = integerToWords(whole);
  let result = `${wholeWords} ${whole === 1n ? "Rupee" : "Rupees"}`;

  if (paisas > 0) {
    const paisaWords = convertThreeDigit(paisas);
    result += ` and ${paisaWords} ${paisas === 1 ? "Paisa" : "Paisas"}`;
  }

  return isNegative ? `Minus ${result}` : result;
}

/**
 * Formats a vendor balance into words with contextual meaning.
 * - Positive balance (> 0): Vendor owes store (Advance paid to vendor)
 * - Negative balance (< 0): Store owes vendor (Unpaid purchases)
 * - Zero balance (== 0): Settled
 */
export function vendorBalanceInWords(balanceStr: string): string {
  const normalized = balanceStr.trim();
  if (!normalized || normalized === "0" || normalized === "0.0" || normalized === "0.00") {
    return "Account is settled (Zero Rupees)";
  }

  if (normalized.startsWith("-")) {
    const abs = normalized.slice(1);
    return `You owe vendor ${currencyToWords(abs)}`;
  }

  return `Vendor owes store ${currencyToWords(normalized)} (Advance)`;
}

/**
 * Formats a customer balance into words with contextual meaning.
 * - Positive balance (> 0): Customer owes store (Unpaid sales)
 * - Negative balance (< 0): Store owes customer (Customer advance / credit)
 * - Zero balance (== 0): Settled
 */
export function customerBalanceInWords(balanceStr: string): string {
  const normalized = balanceStr.trim();
  if (!normalized || normalized === "0" || normalized === "0.0" || normalized === "0.00") {
    return "Account is settled (Zero Rupees)";
  }

  if (normalized.startsWith("-")) {
    const abs = normalized.slice(1);
    return `Customer has ${currencyToWords(abs)} credit`;
  }

  return `Customer owes store ${currencyToWords(normalized)}`;
}

