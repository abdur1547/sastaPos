import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-sale-summary',
  imports: [FormsModule],
  templateUrl: './sale-summary.component.html',
  styleUrl: './sale-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleSummaryComponent {
  readonly itemCount = input<number>(0);
  readonly totalQuantity = input<number>(0);
  readonly discount = input<number>(0);
  readonly totalPayable = input<number>(0);
  readonly discountChanged = output<number>();

  onDiscountChange(value: number): void {
    this.discountChanged.emit(Math.max(0, Number(value) || 0));
  }
}
