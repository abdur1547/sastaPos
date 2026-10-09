import { Injectable, inject } from "@angular/core";

import { ProductService } from "../../features/products/product.service";
import { DatabaseService } from "../database/database.service";
import {
  SEED_PRODUCTS,
  SEED_TAX_CATEGORIES,
  SEED_UNITS,
} from "./seed-data";

/**
 * Dev-only: fills the local SQLite DB with demo data while PowerSync sync is not
 * configured. Remove once data arrives through sync.
 */
@Injectable({ providedIn: "root" })
export class LocalDbSeeder {
  private readonly database = inject(DatabaseService);
  private readonly products = inject(ProductService);

  async seed(): Promise<string> {
    const now = new Date().toISOString();
    const unitIds = new Map<string, string>();
    const taxIds = new Map<string, string>();

    for (const [name, code, allowsFraction] of SEED_UNITS) {
      const existing = await this.database.getOptional<{ id: string }>(
        "SELECT id FROM units_of_measures WHERE code = ?",
        [code],
      );
      const id = existing?.id ?? globalThis.crypto.randomUUID();
      if (!existing) {
        await this.database.execute(
          "INSERT INTO units_of_measures (id, name, code, allows_fraction, is_active, date_created, last_updated) VALUES (?, ?, ?, ?, 1, ?, ?)",
          [id, name, code, allowsFraction ? 1 : 0, now, now],
        );
      }
      unitIds.set(code, id);
    }

    for (const [name, code, rate, isExempt] of SEED_TAX_CATEGORIES) {
      const existing = await this.database.getOptional<{ id: string }>(
        "SELECT id FROM tax_categories WHERE code = ?",
        [code],
      );
      const id = existing?.id ?? globalThis.crypto.randomUUID();
      if (!existing) {
        await this.database.execute(
          "INSERT INTO tax_categories (id, name, code, rate, calculation_type, is_exempt, is_active, store_id, date_created, last_updated) VALUES (?, ?, ?, ?, 'PERCENTAGE', ?, 1, NULL, ?, ?)",
          [id, name, code, rate, isExempt ? 1 : 0, now, now],
        );
      }
      taxIds.set(code, id);
    }

    let created = 0;
    let skipped = 0;
    for (const seed of SEED_PRODUCTS) {
      try {
        const product = await this.products.create({
          name: seed.name,
          sku: seed.sku,
          barcode: seed.barcode,
          pctCode: seed.pctCode,
          description: seed.description,
          unitPrice: seed.unitPrice,
          stockQuantity: seed.stockQuantity,
          unitsOfMeasureId: unitIds.get(seed.unitCode)!,
          taxCategoryIds: [taxIds.get(seed.taxCode)!],
        });
        if (seed.status === "INACTIVE") {
          await this.products.update(product.id, { status: "INACTIVE" });
        }
        created++;
      } catch {
        // Already seeded: sku/barcode/pctCode conflict.
        skipped++;
      }
    }
    return `Seeded ${created} products (${skipped} skipped), ${unitIds.size} units, ${taxIds.size} tax categories.`;
  }

  /** Removes seeded products only (matched by seed SKU); keeps units and tax categories. */
  async clear(): Promise<void> {
    const skus = SEED_PRODUCTS.map((product) => product.sku);
    const marks = skus.map(() => "?").join(", ");
    const ids = `SELECT id FROM products WHERE sku IN (${marks})`;
    await this.database.writeTransaction(async (tx) => {
      for (const table of [
        "product_stock_movements",
        "product_tax_categories",
        "product_unique_keys",
      ]) {
        await tx.execute(`DELETE FROM ${table} WHERE product_id IN (${ids})`, skus);
      }
      await tx.execute(`DELETE FROM products WHERE sku IN (${marks})`, skus);
    });
  }
}
