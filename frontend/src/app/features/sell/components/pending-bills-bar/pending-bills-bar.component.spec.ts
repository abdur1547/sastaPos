import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PendingBillsBarComponent } from "./pending-bills-bar.component";

describe("PendingBillsBarComponent", () => {
  let component: PendingBillsBarComponent;
  let fixture: ComponentFixture<PendingBillsBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingBillsBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PendingBillsBarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
