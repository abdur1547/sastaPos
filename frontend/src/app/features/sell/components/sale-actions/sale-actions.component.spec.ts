import { ComponentFixture, TestBed } from "@angular/core/testing";
import { SaleActionsComponent } from "./sale-actions.component";

describe("SaleActionsComponent", () => {
  let component: SaleActionsComponent;
  let fixture: ComponentFixture<SaleActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleActionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleActionsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
