import {
  currencyToWords,
  customerBalanceInWords,
  integerToWords,
  vendorBalanceInWords,
} from "./number-to-words";

describe("number-to-words utility", () => {
  describe("integerToWords", () => {
    it("converts 0 to Zero", () => {
      expect(integerToWords(0n)).toBe("Zero");
    });

    it("converts single digits", () => {
      expect(integerToWords(1n)).toBe("One");
      expect(integerToWords(5n)).toBe("Five");
      expect(integerToWords(9n)).toBe("Nine");
    });

    it("converts teens and tens", () => {
      expect(integerToWords(11n)).toBe("Eleven");
      expect(integerToWords(15n)).toBe("Fifteen");
      expect(integerToWords(20n)).toBe("Twenty");
      expect(integerToWords(42n)).toBe("Forty Two");
      expect(integerToWords(99n)).toBe("Ninety Nine");
    });

    it("converts hundreds and thousands", () => {
      expect(integerToWords(100n)).toBe("One Hundred");
      expect(integerToWords(305n)).toBe("Three Hundred Five");
      expect(integerToWords(1000n)).toBe("One Thousand");
      expect(integerToWords(1500n)).toBe("One Thousand Five Hundred");
      expect(integerToWords(25000n)).toBe("Twenty Five Thousand");
    });

    it("converts millions and billions", () => {
      expect(integerToWords(1000000n)).toBe("One Million");
      expect(integerToWords(1250000n)).toBe("One Million Two Hundred Fifty Thousand");
      expect(integerToWords(1000000000n)).toBe("One Billion");
    });

    it("converts negative numbers", () => {
      expect(integerToWords(-500n)).toBe("Minus Five Hundred");
    });
  });

  describe("currencyToWords", () => {
    it("converts 0.00 to Zero Rupees", () => {
      expect(currencyToWords("0.00")).toBe("Zero Rupees");
    });

    it("converts whole rupee amounts", () => {
      expect(currencyToWords("1.00")).toBe("One Rupee");
      expect(currencyToWords("500.00")).toBe("Five Hundred Rupees");
      expect(currencyToWords("1500")).toBe("One Thousand Five Hundred Rupees");
    });

    it("converts rupees and paisas", () => {
      expect(currencyToWords("100.50")).toBe("One Hundred Rupees and Fifty Paisas");
      expect(currencyToWords("0.05")).toBe("Zero Rupees and Five Paisas");
      expect(currencyToWords("1.01")).toBe("One Rupee and One Paisa");
    });
  });

  describe("vendorBalanceInWords", () => {
    it("handles settled balance", () => {
      expect(vendorBalanceInWords("0.00")).toBe("Account is settled (Zero Rupees)");
    });

    it("handles store owing vendor (negative balance)", () => {
      expect(vendorBalanceInWords("-1000.00")).toBe("You owe vendor One Thousand Rupees");
    });

    it("handles vendor advance (positive balance)", () => {
      expect(vendorBalanceInWords("500.00")).toBe("Vendor owes store Five Hundred Rupees (Advance)");
    });
  });

  describe("customerBalanceInWords", () => {
    it("handles settled balance", () => {
      expect(customerBalanceInWords("0.00")).toBe("Account is settled (Zero Rupees)");
    });

    it("handles customer owing store (positive balance)", () => {
      expect(customerBalanceInWords("1500.00")).toBe("Customer owes store One Thousand Five Hundred Rupees");
    });

    it("handles customer credit (negative balance)", () => {
      expect(customerBalanceInWords("-250.00")).toBe("Customer has Two Hundred Fifty Rupees credit");
    });
  });
});

