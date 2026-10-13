import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SellProduct } from "../../models/sell.model";
import { SellFormStore } from "../../state/sell-form.store";
import { SaleItemsTableComponent } from "./sale-items-table.component";

describe("SaleItemsTableComponent", () => {
  let component: SaleItemsTableComponent;
  let fixture: ComponentFixture<SaleItemsTableComponent>;
  let store: SellFormStore;

  const product: SellProduct = {
    id: "p1",
    name: "Widget",
    sku: null,
    barcode: null,
    unitPrice: "100.00",
    stockQuantity: "10.00",
    allowsFraction: false,
    unitName: "pcs",
    taxRate: 0,
  };

  function quantityInput(): HTMLInputElement {
    const element: HTMLElement = fixture.nativeElement;
    const input = element.querySelector("input");
    if (!input) {
      throw new Error("Quantity input not rendered");
    }
    return input;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleItemsTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleItemsTableComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(SellFormStore);
    fixture.componentRef.setInput("lines", store.lines);
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("places the tax columns and line total before the remove action", () => {
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const headers = Array.from(element.querySelectorAll("thead th")).map(
      (header) => header.textContent?.trim(),
    );

    expect(headers).toEqual([
      "No",
      "Product",
      "Unit price",
      "Units",
      "Line subtotal",
      "Tax %",
      "Tax amount",
      "Line total",
      "",
    ]);
    expect(element.querySelector(".empty-row")?.getAttribute("colspan")).toBe(
      "9",
    );
  });

  it.each([
    [0, "0%", "0.00", "200.00"],
    [0.175, "17.5%", "35.00", "235.00"],
    [0.0755, "7.55%", "15.10", "215.10"],
  ])(
    "displays the product tax rate %s and calculated line amounts",
    (taxRate, percentage, amount, total) => {
      store.addProduct({ ...product, taxRate }, 2);
      fixture.componentRef.setInput("priced", store.totals().lines);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const cells = element.querySelectorAll("tbody td");

      expect(cells[4].textContent?.trim()).toBe("Rs 200.00");
      expect(cells[5].textContent?.trim()).toBe(percentage);
      expect(cells[6].textContent?.trim()).toBe(`Rs ${amount}`);
      expect(cells[7].textContent?.trim()).toBe(`Rs ${total}`);
      expect(cells[8].querySelector(".remove-button")).not.toBeNull();
    },
  );

  it("updates each product's tax amount and line total when its quantity changes", () => {
    store.addProduct({ ...product, taxRate: 0.1 });
    store.addProduct({ ...product, id: "p2", taxRate: 0.05 }, 2);
    fixture.componentRef.setInput("priced", store.totals().lines);
    fixture.detectChanges();

    const input = quantityInput();
    input.stepUp();
    input.dispatchEvent(new Event("input"));
    fixture.componentRef.setInput("priced", store.totals().lines);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const taxAmounts = Array.from(
      element.querySelectorAll("tbody .col-tax-amount"),
    ).map((cell) => cell.textContent?.trim());

    expect(taxAmounts).toEqual(["Rs 20.00", "Rs 10.00"]);
    const lineTotals = Array.from(
      element.querySelectorAll("tbody .col-total"),
    ).map((cell) => cell.textContent?.trim());

    expect(lineTotals).toEqual(["Rs 220.00", "Rs 210.00"]);
  });

  it("increments whole-unit quantities by exactly one from the first step", () => {
    store.addProduct(product);
    fixture.detectChanges();
    const input = quantityInput();

    expect(input.value).toBe("1");
    for (const quantity of [2, 3, 4]) {
      input.stepUp();
      input.dispatchEvent(new Event("input"));

      expect(input.valueAsNumber).toBe(quantity);
      expect(store.lines.at(0).controls.quantity.value).toBe(quantity);
      expect(store.lines.at(0).controls.quantity.valid).toBe(true);
    }
  });

  it("decrements whole-unit quantities by one without going below one", () => {
    store.addProduct(product, 3);
    fixture.detectChanges();
    const input = quantityInput();

    for (const quantity of [2, 1, 1]) {
      input.stepDown();
      input.dispatchEvent(new Event("input"));

      expect(input.valueAsNumber).toBe(quantity);
      expect(store.lines.at(0).controls.quantity.value).toBe(quantity);
      expect(store.lines.at(0).controls.quantity.valid).toBe(true);
    }
  });

  it("preserves fractional-product steps and minimum quantity", () => {
    store.addProduct({ ...product, allowsFraction: true }, 0.01);
    fixture.detectChanges();
    const input = quantityInput();

    input.stepUp();
    input.dispatchEvent(new Event("input"));
    expect(input.valueAsNumber).toBe(0.02);
    expect(store.lines.at(0).controls.quantity.value).toBe(0.02);

    for (const quantity of [0.01, 0.01]) {
      input.stepDown();
      input.dispatchEvent(new Event("input"));
      expect(input.valueAsNumber).toBe(quantity);
      expect(store.lines.at(0).controls.quantity.value).toBe(quantity);
      expect(store.lines.at(0).controls.quantity.valid).toBe(true);
    }
  });
});
