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
