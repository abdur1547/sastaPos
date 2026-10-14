import { HARDWARE_ROUTES } from "./hardware.routes";
import { HARDWARE_ROUTES as PRODUCTION_HARDWARE_ROUTES } from "./hardware.routes.prod";
import { TestScanPage } from "./test-scan.page";
import { ReceiptPreviewPage } from "./receipt-preview.page";

describe("hardware routes", () => {
  it("lazy-loads Test Scan in development", async () => {
    expect(HARDWARE_ROUTES).toHaveLength(2);
    expect(HARDWARE_ROUTES[1].path).toBe("dev/test-scan");
    const load = HARDWARE_ROUTES[1].loadComponent;
    expect(await load?.()).toBe(TestScanPage);
  });

  it("lazy-loads the virtual receipt preview in development", async () => {
    expect(HARDWARE_ROUTES[0].path).toBe("dev/receipt-preview");
    expect(await HARDWARE_ROUTES[0].loadComponent?.()).toBe(ReceiptPreviewPage);
  });

  it("has no hardware simulator route in production", () => {
    expect(PRODUCTION_HARDWARE_ROUTES).toEqual([]);
  });
});
