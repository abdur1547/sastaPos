import { evaluateVoid, validateVoidReason } from "./sale-void.policy";

const NOW = new Date(2026, 4, 10, 15, 0);
const TODAY_SALE = { status: "COMPLETED" as const, cashierId: "cashier", soldAt: new Date(2026, 4, 10, 9, 0) };

describe("evaluateVoid", () => {
  it("lets the owner void any completed sale", () => {
    const old = { ...TODAY_SALE, soldAt: new Date(2025, 0, 1) };
    expect(evaluateVoid(old, { id: "owner", role: "OWNER" }, NOW)).toEqual({ allowed: true });
  });

  it("lets a cashier void only their own sale from today", () => {
    const cashier = { id: "cashier", role: "CASHIER" as const };
    expect(evaluateVoid(TODAY_SALE, cashier, NOW).allowed).toBe(true);
    expect(evaluateVoid({ ...TODAY_SALE, cashierId: "other" }, cashier, NOW).allowed).toBe(false);
    expect(evaluateVoid({ ...TODAY_SALE, soldAt: new Date(2026, 4, 9, 23, 59) }, cashier, NOW).allowed).toBe(false);
  });

  it("never voids twice or voids a draft", () => {
    const owner = { id: "owner", role: "OWNER" as const };
    expect(evaluateVoid({ ...TODAY_SALE, status: "VOIDED" }, owner, NOW)).toEqual({
      allowed: false,
      reason: "This sale is already voided.",
    });
    expect(evaluateVoid({ ...TODAY_SALE, status: "IN_PROGRESS" }, owner, NOW).allowed).toBe(false);
  });
});

describe("validateVoidReason", () => {
  it("requires a trimmed, bounded reason", () => {
    expect(validateVoidReason("  Wrong item ")).toEqual({ ok: true, value: "Wrong item" });
    expect(validateVoidReason("   ").ok).toBe(false);
    expect(validateVoidReason("x".repeat(1001)).ok).toBe(false);
  });
});
