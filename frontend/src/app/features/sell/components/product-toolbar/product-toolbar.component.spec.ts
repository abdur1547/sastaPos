import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ProductToolbarComponent } from "./product-toolbar.component";

describe("ProductToolbarComponent", () => {
  let component: ProductToolbarComponent;
  let fixture: ComponentFixture<ProductToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductToolbarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductToolbarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
