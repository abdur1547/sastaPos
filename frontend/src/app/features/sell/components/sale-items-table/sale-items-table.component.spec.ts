import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SaleItemsTableComponent } from "./sale-items-table.component";

describe("SaleItemsTableComponent", () => {
  let component: SaleItemsTableComponent;
  let fixture: ComponentFixture<SaleItemsTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleItemsTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleItemsTableComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
