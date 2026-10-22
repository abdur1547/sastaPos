import { TestBed } from "@angular/core/testing";

import { AuthService } from "../../core/auth/auth.service";
import { CustomerPaymentRepository } from "./customer-payment.repository";
import { CustomerRepository } from "./customer.repository";
import { CustomerService } from "./customer.service";
import { CustomerPaymentInput } from "./customer-payment.model";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("CustomerService.takePayment", () => {
  const customerId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const storeId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const userId = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
  const takePayment = jest.fn();
  const user = jest.fn();
  let service: CustomerService;

  beforeEach(() => {
    user.mockReset().mockReturnValue({ id: userId, storeId });
    takePayment.mockReset().mockResolvedValue("10.00");
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: CustomerRepository, useValue: {} },
        { provide: CustomerPaymentRepository, useValue: { takePayment } },
      ],
    });
    service = TestBed.inject(CustomerService);
  });

  it("normalizes input and binds writes to the signed-in store and user, without HTTP", async () => {
    await service.takePayment(customerId, {
      amount: " 15.2 ",
      method: "BANK",
      referenceNumber: " TRX-1 ",
      description: " ",
      allowCredit: true,
    });
    expect(takePayment).toHaveBeenCalledWith({
      id: expect.any(String),
      customerId,
      storeId,
      userId,
      amount: "15.20",
      method: "BANK",
      referenceNumber: "TRX-1",
      description: null,
      allowCredit: true,
      createdAt: expect.any(String),
    });
  });

  it.each([
    { amount: "0", method: "CASH" },
    { amount: "1.001", method: "CASH" },
    { amount: "1", method: "CREDIT" },
    { amount: "1", method: "CASH", referenceNumber: "x".repeat(256) },
    { amount: "1", method: "CASH", description: "x".repeat(1001) },
  ])("rejects invalid payment input before writing", (input) => {
    expect(() =>
      service.takePayment(customerId, input as CustomerPaymentInput),
    ).toThrow();
    expect(takePayment).not.toHaveBeenCalled();
  });

  it("requires valid customer, store and user identities", () => {
    const input: CustomerPaymentInput = { amount: "1", method: "CASH" };
    expect(() => service.takePayment("bad-id", input)).toThrow("UUID");
    user.mockReturnValue({ id: userId, storeId: null });
    expect(() => service.takePayment(customerId, input)).toThrow("store");
    user.mockReturnValue({ id: "", storeId });
    expect(() => service.takePayment(customerId, input)).toThrow("user");
    expect(takePayment).not.toHaveBeenCalled();
  });
});
