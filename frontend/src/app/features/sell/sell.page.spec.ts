import { ErrorHandler } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { By } from "@angular/platform-browser";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Subject, of } from "rxjs";

import { environment } from "../../../environments/environment";
import {
  ScannerEvent,
  ScannerGateway,
  ScannerSimulation,
} from "../../core/hardware/scanner.gateway";
import { PaymentDialogResult } from "./components/payment-dialog/payment-dialog.component";
import { ProductToolbarComponent } from "./components/product-toolbar/product-toolbar.component";
import { SaleActionsComponent } from "./components/sale-actions/sale-actions.component";
import { SellProduct } from "./models/sell.model";
import { SaleService } from "./sale.service";
import { SellPage } from "./sell.page";
import { SellFormStore } from "./state/sell-form.store";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

const product: SellProduct = {
  id: "p1",
  name: "Tea",
  sku: "TEA",
  barcode: "036000291452",
  unitPrice: "100.00",
  stockQuantity: "20.00",
  allowsFraction: false,
  unitName: "Each",
  taxRate: 0,
};

describe("SellPage scanner", () => {
  let fixture: ComponentFixture<SellPage>;
  let store: SellFormStore;
  let products: BehaviorSubject<readonly SellProduct[]>;
  let receive: (event: ScannerEvent) => void;
  let paymentClosed: Subject<PaymentDialogResult | undefined>;
  const openSimulator = jest.fn();
  const sendChunk = jest.fn();
  const close = jest.fn();
  const handleError = jest.fn();
  const notify = jest.fn();
  const complete = jest.fn();
  const saveDraft = jest.fn();
  const dialog = { openDialogs: [] as object[], open: jest.fn() };
  const originalProduction = environment.production;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const scan = (barcode = product.barcode!, scanId = "1:1"): void =>
    receive({ type: "scan", sessionId: "1", scanId, barcode });
  const scanButton = (): HTMLButtonElement => {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll("button"),
    );
    const button = buttons.find(
      (element) => element.textContent?.trim() === "Scan Once",
    );
    if (!button) {
      throw new Error("Scan Once button not found");
    }
    return button;
  };
  const action = (name: "pay" | "addToPending"): void =>
    fixture.debugElement
      .query(By.directive(SaleActionsComponent))
      .triggerEventHandler(name);

  beforeEach(async () => {
    jest.resetAllMocks();
    environment.production = false;
    products = new BehaviorSubject<readonly SellProduct[]>([product]);
    paymentClosed = new Subject<PaymentDialogResult | undefined>();
    dialog.openDialogs = [];
    dialog.open.mockImplementation(() => ({
      afterClosed: () => paymentClosed,
    }));
    sendChunk.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    complete.mockResolvedValue({ invoiceNumber: "INV-1" });
    saveDraft.mockResolvedValue({ id: "draft-1" });
    openSimulator.mockImplementation(
      async (callback: (event: ScannerEvent) => void) => {
        receive = callback;
        return { sendChunk, close } satisfies ScannerSimulation;
      },
    );
    await TestBed.configureTestingModule({
      imports: [SellPage],
      providers: [
        {
          provide: SaleService,
          useValue: {
            watchProducts: () => products,
            watchCustomers: () => of([]),
            watchPendingBills: () => of([]),
            complete,
            saveDraft,
          },
        },
        { provide: ScannerGateway, useValue: { openSimulator } },
        { provide: ErrorHandler, useValue: { handleError } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: notify } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({})) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SellPage);
    store = TestBed.inject(SellFormStore);
  });

  afterEach(() => {
    fixture.destroy();
    environment.production = originalProduction;
  });

  it("adds an exact barcode regardless of focus and increments distinct scans only", async () => {
    await render();
    const discount: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[type="number"]',
    );
    discount.focus();
    scan();
    scan();
    scan(product.barcode!, "1:2");
    expect(store.items()).toEqual([{ product, quantity: 2 }]);
    expect(complete).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("does not use SKU, fuzzy, case-insensitive, or trimmed matches", async () => {
    await render();
    products.next([
      product,
      { ...product, id: "p2", barcode: "Code128", sku: "SKU-ONLY" },
    ]);
    for (const [index, barcode] of [
      "TEA",
      "Tea",
      "036000",
      "36000291452",
      " 036000291452 ",
      "code128",
      "SKU-ONLY",
    ].entries()) {
      scan(barcode, `1:${index}`);
      expect(store.isEmpty()).toBe(true);
    }
    await render();
    expect(fixture.nativeElement.textContent).toContain("Product not found");
    scan("Code128", "1:exact");
    expect(store.items()[0].product.id).toBe("p2");
    await render();
    expect(fixture.nativeElement.textContent).not.toContain(
      "Product not found",
    );
  });

  it("reports unknown and ambiguous barcodes without altering the cart", async () => {
    await render();
    scan();
    const original = store.items();
    scan("missing", "1:2");
    expect(store.items()).toEqual(original);
    products.next([product, { ...product, id: "p2" }]);
    scan(product.barcode!, "1:3");
    await render();
    expect(store.items()).toEqual(original);
    expect(fixture.nativeElement.textContent).toContain(
      "Multiple products have this barcode",
    );
  });

  it("ignores scans during any dialog, does not replay them, and preserves deduplication", async () => {
    await render();
    scan();
    dialog.openDialogs.push({});
    scan("missing", "1:2");
    scan(product.barcode!, "1:3");
    receive({ type: "error", sessionId: "1", message: "Paused error" });
    expect(store.items()[0].quantity).toBe(1);
    dialog.openDialogs = [];
    await render();
    expect(store.items()[0].quantity).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain("Paused error");
    scan();
    scan(product.barcode!, "1:3");
    expect(store.items()[0].quantity).toBe(1);
    scan(product.barcode!, "1:4");
    expect(store.items()[0].quantity).toBe(2);
  });

  it("suspends throughout payment and completion, including the dialog-close gap", async () => {
    let finish!: (value: { invoiceNumber: string }) => void;
    complete.mockReturnValue(
      new Promise<{ invoiceNumber: string }>((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    scan();
    action("pay");
    scan(product.barcode!, "1:2");
    expect(store.items()[0].quantity).toBe(1);
    expect(dialog.open).toHaveBeenCalledTimes(1);
    paymentClosed.next({
      customer: null,
      payment: { amount: "100.00", method: "CASH" },
    });
    // No dialog is open now, but its async continuation has not run yet.
    scan(product.barcode!, "1:3");
    await Promise.resolve();
    expect(complete).toHaveBeenCalledTimes(1);
    scan(product.barcode!, "1:4");
    expect(store.items()[0].quantity).toBe(1);
    finish({ invoiceNumber: "INV-1" });
    // Drain the native async checkout chain before checking resumed scanning.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await render();
    expect(store.isEmpty()).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      "Sale INV-1 completed. Receipt saved; check Receipts for print status.",
      "Dismiss",
      {
        duration: 5000,
      },
    );
    scan(product.barcode!, "1:5");
    expect(store.items()[0].quantity).toBe(1);
  });

  it("resumes scanning after payment cancellation", async () => {
    await render();
    scan();
    action("pay");
    scan(product.barcode!, "1:2");
    paymentClosed.next(undefined);
    await render();
    expect(store.items()[0].quantity).toBe(1);
    expect(complete).not.toHaveBeenCalled();
    scan(product.barcode!, "1:3");
    expect(store.items()[0].quantity).toBe(2);
  });

  it("drops scans during draft submission and resumes after a failed operation", async () => {
    let fail!: (error: Error) => void;
    saveDraft.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );
    await render();
    scan();
    action("addToPending");
    scan(product.barcode!, "1:2");
    expect(store.items()[0].quantity).toBe(1);
    fail(new Error("Save failed"));
    await render();
    expect(store.items()[0].quantity).toBe(1);
    expect(notify).toHaveBeenCalledWith("Save failed", "Dismiss", {
      duration: 5000,
    });
    scan(product.barcode!, "1:3");
    expect(store.items()[0].quantity).toBe(2);
  });

  it("sends simulator input through Rust and waits for the returned event", async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain(
      "No physical device connected",
    );
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[autocomplete="off"]:not([type="number"]):not([role="combobox"])',
    );
    input.value = "036000291452";
    input.dispatchEvent(new Event("input"));
    input.focus();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(enter);
    await render();
    expect(enter.defaultPrevented).toBe(true);
    expect(sendChunk).toHaveBeenCalledWith("036000291452\r");
    expect(store.isEmpty()).toBe(true);
    scan();
    expect(store.items()[0].quantity).toBe(1);
    expect(complete).not.toHaveBeenCalled();
  });

  it("reports parser/send errors separately and keeps manual search available", async () => {
    await render();
    receive({ type: "error", sessionId: "1", message: "Invalid barcode" });
    await render();
    expect(fixture.nativeElement.textContent).toContain("Invalid barcode");
    sendChunk.mockImplementationOnce(async () => {
      throw new Error("Send failed");
    });
    scanButton().click();
    await render();
    expect(fixture.nativeElement.textContent).toContain("Send failed");
    expect(store.isEmpty()).toBe(true);
    const toolbar = fixture.debugElement.query(
      By.directive(ProductToolbarComponent),
    );
    const search: HTMLInputElement =
      toolbar.nativeElement.querySelector("input");
    search.value = "TEA";
    search.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await render();
    expect(store.items()[0].quantity).toBe(1);
  });

  it("reports startup failure without disabling manual cart selection", async () => {
    openSimulator.mockImplementationOnce(async () => {
      throw new Error("Desktop app required");
    });
    await render();
    expect(fixture.nativeElement.textContent).toContain("Desktop app required");
    expect(scanButton().disabled).toBe(true);
    fixture.debugElement
      .query(By.directive(ProductToolbarComponent))
      .triggerEventHandler("productSelected", product);
    expect(store.items()[0].quantity).toBe(1);
  });

  it("releases the consumer and closes the session on navigation", async () => {
    await render();
    scan();
    fixture.destroy();
    scan(product.barcode!, "1:2");
    await Promise.resolve();
    expect(store.items()[0].quantity).toBe(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes a late-starting session without accepting scans after navigation", async () => {
    let finish!: (simulation: ScannerSimulation) => void;
    openSimulator.mockImplementation(
      (callback: (event: ScannerEvent) => void) => {
        receive = callback;
        return new Promise<ScannerSimulation>((resolve) => {
          finish = resolve;
        });
      },
    );
    fixture.detectChanges();
    fixture.destroy();
    finish({ sendChunk, close });
    await Promise.resolve();
    scan();
    expect(close).toHaveBeenCalledTimes(1);
    expect(store.isEmpty()).toBe(true);
  });

  it("reports session cleanup failures through the application error handler", async () => {
    const error = new Error("Stop failed");
    close.mockImplementationOnce(async () => {
      throw error;
    });
    await render();
    fixture.destroy();
    await Promise.resolve();
    expect(handleError).toHaveBeenCalledWith(error);
  });

  it("does not open a simulator or show its controls in production", async () => {
    environment.production = true;
    fixture.destroy();
    fixture = TestBed.createComponent(SellPage);
    await render();
    expect(openSimulator).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain(
      "Simulated scanner",
    );
  });
});
