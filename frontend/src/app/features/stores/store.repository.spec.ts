import { TestBed } from "@angular/core/testing";

import { DatabaseService } from "../../core/database/database.service";
import type {
  BusinessSettingsRecord,
  StoreRecord,
} from "../../core/powersync/app-schema";
import { StoreRepository } from "./store.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("StoreRepository", () => {
  const getOptional = jest.fn();
  let repository: StoreRepository;
  const settings: BusinessSettingsRecord = {
    id: "settings-a",
    invoice_prefix: "INV-",
    invoice_number_start: 100,
    next_invoice_number: 123,
    receipt_footer: "Thank you",
    date_created: "2026-10-10T10:00:00Z",
    last_updated: "2026-10-10T10:00:00Z",
  };
  const store: StoreRecord = {
    id: "store-a",
    name: "Store A",
    ntn: "123",
    address: null,
    currency_code: "PKR",
    timezone: "Asia/Karachi",
    status: "ACTIVE",
    store_settings_id: settings.id,
    date_created: settings.date_created,
    last_updated: settings.last_updated,
  };

  beforeEach(() => {
    getOptional.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { getOptional } }],
    });
    repository = TestBed.inject(StoreRepository);
  });

  it("maps the synced store into a domain model", async () => {
    getOptional.mockResolvedValue(store);

    await expect(repository.findById(store.id)).resolves.toEqual({
      id: store.id,
      name: store.name,
      ntn: store.ntn,
      address: null,
      currencyCode: "PKR",
      timezone: "Asia/Karachi",
      status: "ACTIVE",
      storeSettingsId: settings.id,
      dateCreated: store.date_created,
      lastUpdated: store.last_updated,
    });
    expect(getOptional).toHaveBeenCalledWith(
      "SELECT * FROM stores WHERE id = ?",
      [store.id],
    );
  });

  it("returns null when the store has not synced", async () => {
    getOptional.mockResolvedValue(null);
    await expect(repository.findById(store.id)).resolves.toBeNull();
  });

  it("rejects incomplete store data", async () => {
    getOptional.mockResolvedValue({ ...store, store_settings_id: null });
    await expect(repository.findById(store.id)).rejects.toThrow(
      "Synced store data is incomplete or invalid.",
    );
  });

  it("loads only settings linked to the requested store", async () => {
    getOptional.mockResolvedValue(settings);

    await expect(repository.findSettings(store.id)).resolves.toEqual({
      id: settings.id,
      invoicePrefix: "INV-",
      invoiceNumberStart: 100,
      nextInvoiceNumber: 123,
      receiptFooter: "Thank you",
      dateCreated: settings.date_created,
      lastUpdated: settings.last_updated,
    });
    const [sql, parameters] = getOptional.mock.calls[0];
    expect(sql).toContain("JOIN stores s ON s.store_settings_id = bs.id");
    expect(sql).toContain("WHERE s.id = ?");
    expect(sql).not.toContain("LIMIT 1");
    expect(parameters).toEqual([store.id]);
  });

  it("uses the supplied transaction instead of a separate database read", async () => {
    const transaction = { getOptional: jest.fn().mockResolvedValue(settings) };

    await repository.findSettings(store.id, transaction);

    expect(transaction.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("WHERE s.id = ?"),
      [store.id],
    );
    expect(getOptional).not.toHaveBeenCalled();
  });

  it("returns null if the current store's linked settings have not synced", async () => {
    getOptional.mockResolvedValue(null);
    await expect(repository.findSettings(store.id)).resolves.toBeNull();
  });

  it.each(["invoice_prefix", "invoice_number_start", "next_invoice_number"])(
    "rejects missing %s rather than inventing an invoice sequence",
    async (field) => {
      getOptional.mockResolvedValue({ ...settings, [field]: null });
      await expect(repository.findSettings(store.id)).rejects.toThrow(
        "Synced store settings are incomplete.",
      );
    },
  );
});
