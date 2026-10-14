import { ErrorHandler } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormGroupDirective } from "@angular/forms";
import { By } from "@angular/platform-browser";

import { environment } from "../../../../../environments/environment";
import {
  ScannerEvent,
  ScannerGateway,
  ScannerSimulation,
} from "../../../../core/hardware/scanner.gateway";
import { Product } from "../../product.model";
import { ProductFormComponent } from "./product-form.component";

describe("ProductFormComponent scanner", () => {
  let fixture: ComponentFixture<ProductFormComponent>;
  let receive: (event: ScannerEvent) => void;
  const openSimulator = jest.fn();
  const sendChunk = jest.fn();
  const close = jest.fn();
  const handleError = jest.fn();
  const originalProduction = environment.production;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const barcodeInput = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('[formControlName="barcode"]');
  const form = () =>
    fixture.debugElement
      .query(By.directive(FormGroupDirective))
      .injector.get(FormGroupDirective).form;
  const scan = (barcode = "036000291452", scanId = "1:1"): void =>
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

  beforeEach(async () => {
    jest.resetAllMocks();
    environment.production = false;
    sendChunk.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    openSimulator.mockImplementation(
      async (callback: (event: ScannerEvent) => void) => {
        receive = callback;
        return { sendChunk, close } satisfies ScannerSimulation;
      },
    );
    await TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        { provide: ScannerGateway, useValue: { openSimulator } },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductFormComponent);
  });

  afterEach(() => {
    environment.production = originalProduction;
  });

  it("fills the focused barcode exactly, marks it dirty, and does not submit", async () => {
    const submitted = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    await render();
    scan();
    expect(form().controls["barcode"].value).toBe("");
    barcodeInput().focus();
    scan(" 036000291452 ");
    await render();
    expect(barcodeInput().value).toBe(" 036000291452 ");
    expect(form().controls["barcode"].dirty).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
  });

  it("ignores blur-time scans without replay and keeps manual entry working", async () => {
    await render();
    barcodeInput().focus();
    scan("001");
    barcodeInput().blur();
    scan("002", "1:2");
    barcodeInput().focus();
    expect(form().controls["barcode"].value).toBe("001");
    barcodeInput().value = "manual";
    barcodeInput().dispatchEvent(new Event("input"));
    expect(form().controls["barcode"].value).toBe("manual");
    scan("003", "1:3");
    expect(form().controls["barcode"].value).toBe("003");
  });

  it("deduplicates a record but accepts a distinct scan with the same barcode", async () => {
    await render();
    barcodeInput().focus();
    scan();
    form().controls["barcode"].setValue("manual");
    scan();
    expect(form().controls["barcode"].value).toBe("manual");
    scan("036000291452", "1:2");
    expect(form().controls["barcode"].value).toBe("036000291452");
  });

  it("suspends during saving and resumes only the still-focused field", async () => {
    await render();
    barcodeInput().focus();
    fixture.componentRef.setInput("saving", true);
    // Even before the release effect runs, the event must be rejected.
    scan();
    await render();
    expect(form().controls["barcode"].value).toBe("");
    expect(scanButton().disabled).toBe(true);
    fixture.componentRef.setInput("saving", false);
    await render();
    expect(form().controls["barcode"].value).toBe("");
    scan("001", "1:2");
    expect(form().controls["barcode"].value).toBe("001");
    barcodeInput().blur();
    fixture.componentRef.setInput("saving", true);
    await render();
    fixture.componentRef.setInput("saving", false);
    await render();
    scan("002", "1:3");
    expect(form().controls["barcode"].value).toBe("001");
  });

  it("does not overwrite a disabled control", async () => {
    await render();
    barcodeInput().focus();
    form().controls["barcode"].disable();
    scan();
    await render();
    expect(form().controls["barcode"].value).toBe("");
    expect(scanButton().disabled).toBe(true);
  });

  it("uses the same consumer for an existing product without changing other fields", async () => {
    const product: Product = {
      id: "p1",
      name: "Tea",
      sku: "TEA",
      barcode: "old",
      pctCode: "0902",
      description: null,
      unitPrice: "100.00",
      stockQuantity: "5.00",
      status: "ACTIVE",
      unitsOfMeasureId: "unit",
      taxCategoryIds: [],
      storeId: "store",
      dateCreated: "",
      lastUpdated: "",
    };
    fixture.componentRef.setInput("product", product);
    await render();
    barcodeInput().focus();
    scan();
    expect(form().controls["barcode"].value).toBe("036000291452");
    expect(form().controls["name"].value).toBe("Tea");
    expect(form().controls["sku"].value).toBe("TEA");
    expect(form().controls["stockQuantity"].disabled).toBe(true);
  });

  it("labels simulation, focuses the field, and waits for a Rust event", async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain(
      "No physical device connected",
    );
    const simulated: HTMLInputElement = fixture.nativeElement.querySelector(
      "input:not([formControlName])",
    );
    simulated.value = "000123";
    simulated.dispatchEvent(new Event("input"));
    simulated.focus();
    scanButton().click();
    await render();
    expect(document.activeElement).toBe(barcodeInput());
    expect(sendChunk).toHaveBeenCalledWith("000123\r");
    expect(form().controls["barcode"].value).toBe("");
    scan("000123");
    await render();
    expect(barcodeInput().value).toBe("000123");
  });

  it("shows parser and command errors without altering the field", async () => {
    await render();
    barcodeInput().focus();
    receive({ type: "error", sessionId: "1", message: "Invalid barcode" });
    await render();
    expect(fixture.nativeElement.textContent).toContain("Invalid barcode");
    expect(form().controls["barcode"].pristine).toBe(true);
    sendChunk.mockImplementationOnce(async () => {
      throw new Error("Send failed");
    });

    scanButton().click();
    await render();
    expect(fixture.nativeElement.textContent).toContain("Send failed");
    expect(form().controls["barcode"].value).toBe("");
    scan();
    await render();
    expect(fixture.nativeElement.textContent).not.toContain("Send failed");
  });

  it("uses Enter in the simulator input for scanning, not product submission", async () => {
    await render();
    const submitted = jest.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    const simulated: HTMLInputElement = fixture.nativeElement.querySelector(
      "input:not([formControlName])",
    );
    simulated.focus();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    simulated.dispatchEvent(enter);
    await render();
    expect(enter.defaultPrevented).toBe(true);
    expect(sendChunk).toHaveBeenCalledWith("036000291452\r");
    expect(submitted).not.toHaveBeenCalled();
  });

  it("keeps manual editing available when simulator startup fails", async () => {
    openSimulator.mockRejectedValueOnce(new Error("Desktop app required"));
    await render();
    expect(fixture.nativeElement.textContent).toContain("Desktop app required");
    expect(scanButton().disabled).toBe(true);
    barcodeInput().value = "manual";
    barcodeInput().dispatchEvent(new Event("input"));
    expect(form().controls["barcode"].value).toBe("manual");
  });

  it("releases the consumer before emitting a valid product submission", async () => {
    await render();
    form().patchValue({
      name: "Tea",
      pctCode: "0902",
      unitPrice: "100.00",
      unitsOfMeasureId: "unit",
    });
    barcodeInput().focus();
    scan("001");
    const submitted = jest.fn(() => scan("late", "1:2"));
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.nativeElement
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: "001" }),
    );
    expect(form().controls["barcode"].value).toBe("001");
  });

  it("does not create simulator sessions or controls in production", async () => {
    fixture.destroy();
    environment.production = true;
    fixture = TestBed.createComponent(ProductFormComponent);
    await render();
    barcodeInput().focus();
    expect(openSimulator).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain(
      "Simulated scanner",
    );
  });

  it("releases on destruction, ignores late events, and reports cleanup errors", async () => {
    await render();
    barcodeInput().focus();
    const control = form().controls["barcode"];
    close.mockRejectedValueOnce(new Error("Stop failed"));
    fixture.destroy();
    scan();
    await fixture.whenStable();
    expect(control.value).toBe("");
    expect(close).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(new Error("Stop failed"));
  });

  it("closes startup that completes after destruction", async () => {
    let resolve!: (simulation: ScannerSimulation) => void;
    openSimulator.mockReturnValueOnce(
      new Promise<ScannerSimulation>((done) => {
        resolve = done;
      }),
    );
    fixture.detectChanges();
    fixture.destroy();
    resolve({ sendChunk, close });
    await fixture.whenStable();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
