import {
  balanceAfterPayment,
  customerBalanceLabel,
  paymentAmount,
} from "./customer-payment.model";

describe("customer payment money rules", () => {
  it.each([
    ["1", "1.00"],
    [" 400.25 ", "400.25"],
    ["0.01", "0.01"],
    ["9999999999999999.99", "9999999999999999.99"],
  ])("normalizes %s exactly", (value, expected) => {
    expect(paymentAmount(value)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "-1",
    "0.001",
    "1.234",
    "1e3",
    "NaN",
    "Infinity",
    "1,000",
    "10000000000000000",
  ])("rejects invalid amount %s without rounding", (value) => {
    expect(() => paymentAmount(value)).toThrow();
  });

  it("calculates partial, full and advance payments without floating-point loss", () => {
    expect(balanceAfterPayment("1000.00", "400.25")).toBe("599.75");
    expect(balanceAfterPayment("0.30", "0.30")).toBe("0.00");
    expect(balanceAfterPayment("100.00", "250")).toBe("-150.00");
    expect(balanceAfterPayment("9999999999999999.99", "0.01")).toBe(
      "9999999999999999.98",
    );
    expect(() => balanceAfterPayment("-9999999999999999.99", "0.01")).toThrow(
      "out of range",
    );
  });

  it("labels debt, settled accounts and customer credit explicitly", () => {
    expect(customerBalanceLabel("25")).toBe("Customer owes you Rs 25.00");
    expect(customerBalanceLabel("0")).toBe("Settled");
    expect(customerBalanceLabel("-25")).toBe("Customer has Rs 25.00 credit");
  });
});
