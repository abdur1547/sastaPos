import {
  balanceAfterVendorPayment,
  doesPaymentCrossZero,
  parsePaymentAmount,
  previewVendorPayment,
} from "./vendor-payment.model";
import { VendorValidationError } from "./vendor.errors";

describe("vendor payment model rules", () => {
  describe("parsePaymentAmount", () => {
    it("normalizes standard positive amounts", () => {
      expect(parsePaymentAmount("100")).toBe("100.00");
      expect(parsePaymentAmount("100.5")).toBe("100.50");
      expect(parsePaymentAmount("0.05")).toBe("0.05");
      expect(parsePaymentAmount("  1500.25  ")).toBe("1500.25");
    });

    it("rejects zero and negative amounts", () => {
      expect(() => parsePaymentAmount("0")).toThrow(VendorValidationError);
      expect(() => parsePaymentAmount("0.00")).toThrow(VendorValidationError);
      expect(() => parsePaymentAmount("-50")).toThrow(VendorValidationError);
    });

    it("rejects non-numeric and malformed inputs", () => {
      expect(() => parsePaymentAmount("abc")).toThrow(VendorValidationError);
      expect(() => parsePaymentAmount("")).toThrow(VendorValidationError);
      expect(() => parsePaymentAmount("10.123")).toThrow(VendorValidationError);
    });
  });

  describe("balanceAfterVendorPayment", () => {
    it("handles paying vendor (OUTGOING) reducing debt", () => {
      // Store owes vendor 1000 (-1000). We pay 600. Result: -400.
      expect(balanceAfterVendorPayment("-1000.00", "600.00", "OUTGOING")).toBe("-400.00");
    });

    it("handles paying vendor (OUTGOING) crossing into advance", () => {
      // Store owes vendor 400 (-400). We pay 500. Result: +100.
      expect(balanceAfterVendorPayment("-400.00", "500.00", "OUTGOING")).toBe("100.00");
    });

    it("handles receiving refund/settlement from vendor (INCOMING)", () => {
      // Vendor owes store 100 (+100). Vendor refunds 100. Result: 0.00.
      expect(balanceAfterVendorPayment("100.00", "100.00", "INCOMING")).toBe("0.00");
    });

    it("handles receiving refund from vendor (INCOMING) crossing into debt", () => {
      // Vendor owes store 100 (+100). Vendor returns 150. Result: -50.00.
      expect(balanceAfterVendorPayment("100.00", "150.00", "INCOMING")).toBe("-50.00");
    });
  });

  describe("doesPaymentCrossZero", () => {
    it("returns true when crossing from negative to positive", () => {
      expect(doesPaymentCrossZero("-100.00", "50.00")).toBe(true);
    });

    it("returns true when crossing from positive to negative", () => {
      expect(doesPaymentCrossZero("100.00", "-50.00")).toBe(true);
    });

    it("returns false when moving towards zero without crossing", () => {
      expect(doesPaymentCrossZero("-100.00", "-50.00")).toBe(false);
      expect(doesPaymentCrossZero("-100.00", "0.00")).toBe(false);
      expect(doesPaymentCrossZero("100.00", "50.00")).toBe(false);
      expect(doesPaymentCrossZero("100.00", "0.00")).toBe(false);
    });

    it("returns false when staying on the same side further from zero", () => {
      expect(doesPaymentCrossZero("100.00", "200.00")).toBe(false);
      expect(doesPaymentCrossZero("-100.00", "-200.00")).toBe(false);
    });
  });

  describe("previewVendorPayment", () => {
    it("generates correct preview for outgoing payment crossing zero", () => {
      const preview = previewVendorPayment("-500.00", "600.00", "OUTGOING");
      expect(preview.balance).toBe("100.00");
      expect(preview.label).toBe("Vendor owes you Rs 100.00 (Advance)");
      expect(preview.crossesZero).toBe(true);
      expect(preview.zeroCrossWarning).toContain("creates a vendor advance");
    });

    it("generates correct preview for non-crossing outgoing payment", () => {
      const preview = previewVendorPayment("-500.00", "300.00", "OUTGOING");
      expect(preview.balance).toBe("-200.00");
      expect(preview.label).toBe("You owe vendor Rs 200.00");
      expect(preview.crossesZero).toBe(false);
      expect(preview.zeroCrossWarning).toBeUndefined();
    });
  });
});

