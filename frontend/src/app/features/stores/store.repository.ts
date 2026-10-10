import { Injectable, inject } from "@angular/core";

import {
  DatabaseExecutor,
  DatabaseService,
} from "../../core/database/database.service";
import type {
  BusinessSettingsRecord,
  StoreRecord,
} from "../../core/powersync/app-schema";
import { BusinessSettings, Store } from "./store.model";

@Injectable({ providedIn: "root" })
export class StoreRepository {
  private readonly database = inject(DatabaseService);

  async findById(storeId: string): Promise<Store | null> {
    const row = await this.database.getOptional<StoreRecord>(
      "SELECT * FROM stores WHERE id = ?",
      [storeId],
    );
    if (!row) {
      return null;
    }
    if (
      row.name === null ||
      row.ntn === null ||
      row.currency_code === null ||
      row.timezone === null ||
      (row.status !== "ACTIVE" && row.status !== "INACTIVE") ||
      row.store_settings_id === null ||
      row.date_created === null ||
      row.last_updated === null
    ) {
      throw new Error("Synced store data is incomplete or invalid.");
    }
    return {
      id: row.id,
      name: row.name,
      ntn: row.ntn,
      address: row.address,
      currencyCode: row.currency_code,
      timezone: row.timezone,
      status: row.status,
      storeSettingsId: row.store_settings_id,
      dateCreated: row.date_created,
      lastUpdated: row.last_updated,
    };
  }

  async findSettings(
    storeId: string,
    executor: Pick<DatabaseExecutor, "getOptional"> = this.database,
  ): Promise<BusinessSettings | null> {
    const row = await executor.getOptional<BusinessSettingsRecord>(
      `SELECT bs.* FROM business_settings bs
       JOIN stores s ON s.store_settings_id = bs.id
       WHERE s.id = ?`,
      [storeId],
    );
    if (!row) {
      return null;
    }
    if (
      row.invoice_prefix === null ||
      row.invoice_number_start === null ||
      row.next_invoice_number === null ||
      row.receipt_footer === null ||
      row.date_created === null ||
      row.last_updated === null
    ) {
      throw new Error("Synced store settings are incomplete.");
    }
    return {
      id: row.id,
      invoicePrefix: row.invoice_prefix,
      invoiceNumberStart: row.invoice_number_start,
      nextInvoiceNumber: row.next_invoice_number,
      receiptFooter: row.receipt_footer,
      dateCreated: row.date_created,
      lastUpdated: row.last_updated,
    };
  }
}
