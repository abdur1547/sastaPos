import { previewTotals } from "./sale-calculator";
import { SellProduct } from "../models/sell.model";

const product = (overrides: Partial<SellProduct> = {}): SellProduct => ({
  id: "p1",
  name: "Widget",
  sku: null,
  barcode: null,
  unitPrice: "100.00",
  stockQuantity: "10.00",
  allowsFraction: false,
  unitName: "pcs",
  taxRate: 0.1,
  ...overrides,
});

describe("previewTotals", () => {
  it("applies exclusive tax per line", () => {
    const totals = previewTotals([{ product: product(), quantity: 2 }], "0");
    expect(totals.subtotal).toBe("200.00");
    expect(totals.tax).toBe("20.00");
    expect(totals.total).toBe("220.00");
  });

  it("discount reduces the taxable base", () => {
    const totals = previewTotals([{ product: product(), quantity: 2 }], "50");
    expect(totals.total).toBe("170.00");
  });
});
