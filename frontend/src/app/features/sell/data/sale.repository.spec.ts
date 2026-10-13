import { TestBed } from "@angular/core/testing";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../../core/database/database.service";
import { BusinessSettings } from "../../stores/store.model";
import { StoreRepository } from "../../stores/store.repository";
import { SaleRequest } from "../models/sale.model";
import { SellProduct } from "../models/sell.model";
import { SaleConflictError } from "../sell.errors";
import { SaleRepository } from "./sale.repository";
import { SellCatalogRepository } from "./sell-catalog.repository";

jest.mock("../../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("SaleRepository invoice allocation", () => {
  const context = { storeId: "store-a", userId: "user-a" };
  const product: SellProduct = {
    id: "product-a",
    name: "Widget",
    sku: null,
    barcode: null,
    unitPrice: "100.00",
    stockQuantity: "10.00",
    allowsFraction: false,
    unitName: "pcs",
    taxRate: 0,
  };
  const settings: BusinessSettings = {
    id: "settings-a",
    invoicePrefix: "INV-",
    invoiceNumberStart: 100,
    nextInvoiceNumber: 123,
    receiptFooter: "",
    dateCreated: "2026-10-10T10:00:00Z",
    lastUpdated: "2026-10-10T10:00:00Z",
  };
  const request: SaleRequest = {
    saleId: null,
    saleType: "DEBIT",
    customerId: null,
    discount: "0.00",
    saleStatus: "COMPLETED",
    description: null,
    saleItems: [
      { productId: product.id, quantity: "1.00", itemTotal: "100.00" },
    ],
    payments: [
      {
        amount: "100.00",
        method: "CASH",
        referenceNumber: null,
        description: null,
      },
    ],
    totalItems: 1,
    totalPrice: "100.00",
    totalPaidPrice: "100.00",
  };
  const execute = jest.fn();
  const getOptional = jest.fn();
  const get = jest.fn();
  const findSettings = jest.fn();
  let transaction: DatabaseExecutor;
  let repository: SaleRepository;

  beforeEach(() => {
    execute.mockReset().mockResolvedValue({ rows: [], rowsAffected: 1 });
    getOptional.mockReset().mockResolvedValue(null);
    get.mockReset().mockResolvedValue({ status: "ACTIVE" });
    findSettings.mockReset().mockResolvedValue(settings);
    transaction = { execute, getOptional, get, getAll: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DatabaseService,
          useValue: {
            writeTransaction: <Result>(
              operation: (tx: DatabaseExecutor) => Promise<Result>,
            ) => operation(transaction),
          },
        },
        {
          provide: SellCatalogRepository,
          useValue: {
            findProductsByIds: jest.fn().mockResolvedValue([product]),
          },
        },
        { provide: StoreRepository, useValue: { findSettings } },
      ],
    });
    repository = TestBed.inject(SaleRepository);
  });

  it("uses the current store's settings in the sale transaction", async () => {
    await expect(repository.submit(request, context)).resolves.toMatchObject({
      invoiceNumber: "INV-123",
      status: "COMPLETED",
    });

    expect(findSettings).toHaveBeenCalledWith(context.storeId, transaction);
    expect(execute.mock.calls[0]).toEqual([
      expect.stringContaining("UPDATE business_settings"),
      [124, expect.any(String), settings.id],
    ]);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sales"),
      expect.arrayContaining(["INV-123", context.storeId, context.userId]),
    );
  });

  it("accepts an empty invoice prefix", async () => {
    findSettings.mockResolvedValue({ ...settings, invoicePrefix: "" });
    await expect(repository.submit(request, context)).resolves.toMatchObject({
      invoiceNumber: "123",
    });
  });

  it.each(["COMPLETED", "IN_PROGRESS"] as const)(
    "stores a late-evening %s sale as the current UTC instant",
    async (saleStatus) => {
      const now = new Date("2026-10-13T23:30:00+05:00");
      jest.useFakeTimers().setSystemTime(now);
      try {
        await repository.submit(
          {
            ...request,
            saleStatus,
            payments: saleStatus === "COMPLETED" ? request.payments : [],
            totalPaidPrice: saleStatus === "COMPLETED" ? "100.00" : "0.00",
          },
          context,
        );
        const saleWrite = execute.mock.calls.find(([sql]) =>
          sql.includes("INSERT INTO sales"),
        );
        expect(saleWrite?.[1][9]).toBe("2026-10-13T18:30:00.000Z");
        expect(saleWrite?.[1].slice(17)).toEqual([
          "2026-10-13T18:30:00.000Z",
          "2026-10-13T18:30:00.000Z",
        ]);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it.each([
    ["DEBIT", ["100.00"], "0.00", "25.00"],
    ["DEBIT", ["40.00", "60.00"], "0.00", "25.00"],
    ["CREDIT", ["40.00"], "60.00", "85.00"],
    ["CREDIT", [], "100.00", "125.00"],
  ] as const)(
    "links %s sale debit and all payment credits to the same sale (%s)",
    async (saleType, amounts, remaining, expectedBalance) => {
      getOptional.mockResolvedValue({
        id: "customer-a",
        status: "ACTIVE",
        account_balance: "25.00",
      });
      const receipt = await repository.submit(
        {
          ...request,
          customerId: "customer-a",
          saleType,
          payments: amounts.map((amount) => ({
            ...request.payments[0],
            amount,
          })),
          totalPaidPrice: remaining === "0.00" ? "100.00" : (amounts[0] ?? "0.00"),
        },
        context,
      );

      const entries = execute.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO ledger_entries"),
      );
      expect(entries).toHaveLength(1 + amounts.length);
      for (const [, parameters] of entries) {
        expect(parameters[4]).toBe("INV-123");
        expect(parameters[6]).toBe("customer-a");
        expect(parameters[7]).toBe(receipt.id);
      }
      expect(entries[0][1].slice(1, 4)).toEqual(["DEBIT", "100.00", "SALE"]);
      amounts.forEach((amount, index) => {
        expect(entries[index + 1][1].slice(1, 4)).toEqual([
          "CREDIT",
          amount,
          "PAYMENT",
        ]);
      });
      expect(receipt.remaining).toBe(remaining);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE customers SET account_balance"),
        [
          expectedBalance,
          expect.any(String),
          "customer-a",
        ],
      );
    },
  );

  it("does not write customer ledger entries for an anonymous sale", async () => {
    await repository.submit(request, context);
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ledger_entries"),
      expect.anything(),
    );
  });

  it("allows the last counter that can still be incremented within a backend integer", async () => {
    findSettings.mockResolvedValue({
      ...settings,
      nextInvoiceNumber: 2_147_483_646,
    });

    await expect(repository.submit(request, context)).resolves.toMatchObject({
      invoiceNumber: "INV-2147483646",
    });
    expect(execute.mock.calls[0][1]).toEqual([
      2_147_483_647,
      expect.any(String),
      settings.id,
    ]);
  });

  it("blocks completion without synced settings before writing anything", async () => {
    findSettings.mockResolvedValue(null);

    await expect(repository.submit(request, context)).rejects.toThrow(
      "Store settings have not synced yet",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([null, 0, 99, 123.5, Number.NaN, 2_147_483_647])(
    "rejects invalid or exhausted next invoice number %s",
    async (nextInvoiceNumber) => {
      findSettings.mockResolvedValue({ ...settings, nextInvoiceNumber });

      await expect(repository.submit(request, context)).rejects.toBeInstanceOf(
        SaleConflictError,
      );
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("propagates incomplete settings without writing a sale", async () => {
    findSettings.mockRejectedValue(
      new Error("Synced store settings are incomplete."),
    );

    await expect(repository.submit(request, context)).rejects.toThrow(
      "Synced store settings are incomplete.",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("can save a draft before invoice settings have synced", async () => {
    findSettings.mockResolvedValue(null);

    await expect(
      repository.submit(
        {
          ...request,
          saleStatus: "IN_PROGRESS",
          payments: [],
          totalPaidPrice: "0.00",
        },
        context,
      ),
    ).resolves.toMatchObject({
      invoiceNumber: expect.stringMatching(/^DRAFT-/),
      status: "IN_PROGRESS",
    });
    expect(findSettings).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE business_settings"),
      expect.anything(),
    );
  });

  it("issues a real invoice when finalising a draft", async () => {
    getOptional.mockResolvedValue({ status: "IN_PROGRESS" });

    await expect(
      repository.submit({ ...request, saleId: "draft-a" }, context),
    ).resolves.toMatchObject({ id: "draft-a", invoiceNumber: "INV-123" });
    expect(findSettings).toHaveBeenCalledWith(context.storeId, transaction);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sales SET invoice_number"),
      expect.arrayContaining(["INV-123", "draft-a"]),
    );
  });
});
