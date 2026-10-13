import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-sale-summary",
  imports: [ReactiveFormsModule],
  templateUrl: "./sale-summary.component.html",
  styleUrl: "./sale-summary.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleSummaryComponent {
  readonly itemCount = input<number>(0);
  readonly totalQuantity = input<string>("0");
  readonly subtotal = input<string>("0.00");
  readonly discount = input.required<FormControl<number | null>>();
  readonly discountError = input<boolean>(false);
  readonly tax = input<string>("0.00");
  readonly totalPayable = input<string>("0.00");
}
