export const RETURN_TO_PARAM = "returnTo";

/** Accepts only in-app absolute paths so a crafted link cannot redirect to another origin. */
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }
  return value;
}
