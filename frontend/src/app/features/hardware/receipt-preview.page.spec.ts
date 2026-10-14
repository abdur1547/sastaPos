import { ErrorHandler } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
  ReceiptGateway,
  ReceiptLayout,
} from "../../core/hardware/receipt.gateway";
import { ReceiptPreviewPage } from "./receipt-preview.page";

describe("ReceiptPreviewPage", () => {
  let fixture: ComponentFixture<ReceiptPreviewPage>;
  const preview = jest.fn();
  const handleError = jest.fn();
  const layout: ReceiptLayout = {
    version: 1,
    paperWidthMm: 58,
    columns: 32,
    lines: ["  Rust-generated header", "TOTAL                 PKR 396.00"],
  };
  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const submit = (): void => {
    fixture.nativeElement
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };
  const enterHeader = (value: string): void => {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector(
      'textarea[formControlName="header"]',
    );
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    preview.mockResolvedValue(layout);
    await TestBed.configureTestingModule({
      imports: [ReceiptPreviewPage],
      providers: [
        { provide: ReceiptGateway, useValue: { preview } },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReceiptPreviewPage);
  });

  it("labels sample-only output and presents exact Rust lines without reformatting", async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain(
      "No physical receipt is printed",
    );
    expect(preview).not.toHaveBeenCalled();
    submit();
    await render();
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: "SAMPLE-001",
        paidMinor: 30000,
      }),
      expect.objectContaining({
        version: 1,
        paperProfile: "58mm",
        showCustomer: true,
      }),
    );
    const paper: HTMLPreElement = fixture.nativeElement.querySelector("pre");
    expect(paper.textContent).toBe(layout.lines.join("\n"));
    expect(paper.style.width).toBe("32ch");
  });

  it("clears stale output when settings change and rejects unsupported text", async () => {
    await render();
    submit();
    await render();
    enterHeader("Updated Store");
    expect(fixture.nativeElement.querySelector("pre")).toBeNull();
    enterHeader("Unsupported \u0627");
    submit();
    await render();
    expect(preview).toHaveBeenCalledTimes(1);
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain("ASCII");
  });

  it("sends the selected wide profile and optional fields to Rust", async () => {
    preview.mockResolvedValueOnce({ ...layout, paperWidthMm: 80, columns: 48 });
    await render();
    fixture.nativeElement.querySelector("mat-select").click();
    await render();
    const options = Array.from(
      document.querySelectorAll<HTMLElement>("mat-option"),
    );
    const wide = options.find((option) =>
      option.textContent?.includes("80 mm"),
    );
    expect(wide).toBeDefined();
    wide?.click();
    await render();
    fixture.nativeElement
      .querySelector('mat-checkbox[formControlName="showBarcode"] input')
      .click();
    await render();
    submit();
    await render();
    expect(preview).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paperProfile: "80mm", showBarcode: true }),
    );
    expect(fixture.nativeElement.querySelector("pre").style.width).toBe("48ch");
  });

  it("surfaces native errors instead of displaying a fake receipt", async () => {
    preview.mockRejectedValueOnce("Native rendering failed");
    await render();
    submit();
    await render();
    expect(
      fixture.nativeElement.querySelector('[role="alert"]').textContent,
    ).toContain("Native rendering failed");
    expect(fixture.nativeElement.querySelector("pre")).toBeNull();
    expect(fixture.nativeElement.querySelector("button").disabled).toBe(false);
  });

  it("disables settings while rendering and ignores completion after navigation", async () => {
    let finish!: (value: ReceiptLayout) => void;
    preview.mockImplementationOnce(
      () =>
        new Promise<ReceiptLayout>((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("textarea").disabled).toBe(true);
    expect(fixture.nativeElement.querySelector("button").disabled).toBe(true);
    submit();
    expect(preview).toHaveBeenCalledTimes(1);
    fixture.destroy();
    finish(layout);
    await Promise.resolve();
    expect(handleError).not.toHaveBeenCalled();
  });
});
