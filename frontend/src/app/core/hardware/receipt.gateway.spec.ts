import { TestBed } from "@angular/core/testing";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { environment } from "../../../environments/environment";
import { ReceiptConfig, ReceiptData, ReceiptGateway } from "./receipt.gateway";

jest.mock("@tauri-apps/api/core", () => ({
  invoke: jest.fn(),
  isTauri: jest.fn(),
}));

describe("ReceiptGateway", () => {
  const originalProduction = environment.production;
  const data: ReceiptData = {
    invoiceNumber: "SAMPLE-001",
    issuedAt: "2026-10-14",
    currency: "PKR",
    customer: null,
    items: [
      {
        name: "Tea",
        sku: null,
        barcode: "001",
        quantity: 2,
        unitPriceMinor: 12550,
      },
    ],
    discountMinor: 0,
    taxMinor: 0,
    paidMinor: 0,
    isCopy: false,
  };
  const config: ReceiptConfig = {
    version: 1,
    paperProfile: "58mm",
    header: "Store",
    footer: "",
    showSku: false,
    showBarcode: true,
    showCustomer: false,
  };
  let gateway: ReceiptGateway;

  beforeEach(() => {
    jest.resetAllMocks();
    environment.production = false;
    jest.mocked(isTauri).mockReturnValue(true);
    gateway = TestBed.inject(ReceiptGateway);
  });

  afterEach(() => {
    environment.production = originalProduction;
  });

  it("passes structured data to Rust and returns its layout unchanged", async () => {
    const layout = {
      version: 1,
      paperWidthMm: 58,
      columns: 32,
      lines: ["Rust output"],
    };
    jest.mocked(invoke).mockResolvedValue(layout);
    expect(await gateway.preview(data, config)).toBe(layout);
    expect(invoke).toHaveBeenCalledWith("receipt_preview", { data, config });
  });

  it("rejects browser and production use without rendering a fallback", async () => {
    jest.mocked(isTauri).mockReturnValue(false);
    await expect(gateway.preview(data, config)).rejects.toThrow(
      "Tauri desktop app",
    );
    environment.production = true;
    jest.mocked(isTauri).mockReturnValue(true);
    await expect(gateway.preview(data, config)).rejects.toThrow(
      "development builds only",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects non-integer and unsafe monetary inputs before serialization", async () => {
    for (const paidMinor of [1.2, Number.MAX_SAFE_INTEGER + 1, -1]) {
      await expect(
        gateway.preview({ ...data, paidMinor }, config),
      ).rejects.toThrow("numeric input");
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("propagates native validation or transport failures", async () => {
    jest.mocked(invoke).mockRejectedValue("Header must use printable ASCII.");
    await expect(gateway.preview(data, config)).rejects.toBe(
      "Header must use printable ASCII.",
    );
  });
});
