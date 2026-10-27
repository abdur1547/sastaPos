import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { AuthService } from "../../core/auth/auth.service";
import { VendorRepository } from "./vendor.repository";
import { VendorLedgerRepository } from "./vendor-ledger.repository";
import { VendorPaymentRepository } from "./vendor-payment.repository";
import { VendorService } from "./vendor.service";
import { VendorValidationError } from "./vendor.errors";
import { RecordVendorPaymentInput } from "./vendor-payment.model";
import { User } from "../users/user.model";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("VendorService", () => {
  let service: VendorService;
  const mockRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    watch: jest.fn(),
    watchPage: jest.fn(),
  };
  const mockLedger = {
    watchPage: jest.fn(),
    getSummary: jest.fn(),
  };
  const mockPayments = {
    takePayment: jest.fn(),
    voidPayment: jest.fn(),
  };

  const currentUser = signal<User | null>({
    id: "11111111-1111-1111-1111-111111111111",
    username: "owner",
    fullName: "Store Owner",
    role: "OWNER",
    storeId: "22222222-2222-2222-2222-222222222222",
    storeName: "Test Store",
    isActive: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser.set({
      id: "11111111-1111-1111-1111-111111111111",
      username: "owner",
      fullName: "Store Owner",
      role: "OWNER",
      storeId: "22222222-2222-2222-2222-222222222222",
      storeName: "Test Store",
      isActive: true,
    });

    TestBed.configureTestingModule({
      providers: [
        VendorService,
        { provide: AuthService, useValue: { user: currentUser } },
        { provide: VendorRepository, useValue: mockRepo },
        { provide: VendorLedgerRepository, useValue: mockLedger },
        { provide: VendorPaymentRepository, useValue: mockPayments },
      ],
    });
    service = TestBed.inject(VendorService);
  });

  describe("create", () => {
    it("creates an unregistered vendor without STRN", async () => {
      mockRepo.create.mockImplementation((v) => Promise.resolve(v));

      const result = await service.create({
        name: "Acme Supplies",
        phoneNumber: "+923001234567",
      });

      expect(result.name).toBe("Acme Supplies");
      expect(result.salesTaxRegistrationStatus).toBe("UNREGISTERED");
      expect(result.accountBalance).toBe("0.00");
      expect(result.status).toBe("ACTIVE");
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it("requires STRN when vendor is registered", async () => {
      await expect(
        service.create({
          name: "Acme Supplies",
          salesTaxRegistrationStatus: "REGISTERED",
          strn: "",
        }),
      ).rejects.toThrow(VendorValidationError);
    });

    it("creates a registered vendor with non-blank STRN", async () => {
      mockRepo.create.mockImplementation((v) => Promise.resolve(v));

      const result = await service.create({
        name: "Acme Supplies",
        salesTaxRegistrationStatus: "REGISTERED",
        strn: "1234567890123",
      });

      expect(result.salesTaxRegistrationStatus).toBe("REGISTERED");
      expect(result.strn).toBe("1234567890123");
    });
  });

  describe("update", () => {
    it("requires STRN when updated to REGISTERED", async () => {
      mockRepo.findById.mockResolvedValueOnce({
        id: "33333333-3333-3333-3333-333333333333",
        name: "Acme Supplies",
        salesTaxRegistrationStatus: "UNREGISTERED",
        strn: null,
      });

      await expect(
        service.update("33333333-3333-3333-3333-333333333333", {
          salesTaxRegistrationStatus: "REGISTERED",
          strn: null,
        }),
      ).rejects.toThrow(VendorValidationError);
    });
  });

  describe("recordPayment", () => {
    it("validates payment direction and method", async () => {
      await expect(
        service.recordPayment("33333333-3333-3333-3333-333333333333", {
          direction: "INVALID" as unknown as RecordVendorPaymentInput["direction"],
          amount: "100.00",
          method: "CASH",
        }),
      ).rejects.toThrow(VendorValidationError);

      await expect(
        service.recordPayment("33333333-3333-3333-3333-333333333333", {
          direction: "OUTGOING",
          amount: "100.00",
          method: "CREDIT" as unknown as RecordVendorPaymentInput["method"],
        }),
      ).rejects.toThrow(VendorValidationError);
    });

    it("calls repository takePayment with parsed amount and UUID", async () => {
      mockPayments.takePayment.mockResolvedValue("-500.00");

      await service.recordPayment("33333333-3333-3333-3333-333333333333", {
        direction: "OUTGOING",
        amount: "500",
        method: "BANK",
        referenceNumber: "CHK-123",
      });

      expect(mockPayments.takePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "OUTGOING",
          amount: "500.00",
          method: "BANK",
          referenceNumber: "CHK-123",
          vendorId: "33333333-3333-3333-3333-333333333333",
        }),
      );
    });
  });

  describe("voidPayment", () => {
    it("rejects voiding if user is not OWNER", async () => {
      currentUser.set({
        id: "44444444-4444-4444-4444-444444444444",
        username: "cashier",
        fullName: "Store Cashier",
        role: "CASHIER",
        storeId: "22222222-2222-2222-2222-222222222222",
        storeName: "Test Store",
        isActive: true,
      });

      await expect(
        service.voidPayment(
          "55555555-5555-5555-5555-555555555555",
          "33333333-3333-3333-3333-333333333333",
          "Recording error",
        ),
      ).rejects.toThrow("Only the store owner can void a payment.");
    });

    it("allows OWNER to void payment", async () => {
      mockPayments.voidPayment.mockResolvedValue("-1000.00");

      await service.voidPayment(
        "55555555-5555-5555-5555-555555555555",
        "33333333-3333-3333-3333-333333333333",
        "Entered wrong amount",
      );

      expect(mockPayments.voidPayment).toHaveBeenCalledWith(
        "22222222-2222-2222-2222-222222222222",
        "11111111-1111-1111-1111-111111111111",
        "55555555-5555-5555-5555-555555555555",
        "33333333-3333-3333-3333-333333333333",
        "Entered wrong amount",
      );
    });
  });
});

