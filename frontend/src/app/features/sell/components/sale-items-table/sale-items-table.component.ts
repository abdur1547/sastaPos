import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { CartLine } from '../../models/sell.model';

@Component({
  selector: 'app-sale-items-table',
  imports: [FormsModule, MatIconModule],
  templateUrl: './sale-items-table.component.html',
  styleUrl: './sale-items-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleItemsTableComponent {
  readonly items = input<CartLine[]>([]);
  readonly quantityChanged = output<{ productId: string; quantity: number }>();
  readonly removeItem = output<string>();

  onQuantityChange(productId: string, value: number): void {
    const quantity = Math.max(1, Math.floor(Number(value) || 1));
    this.quantityChanged.emit({ productId, quantity });
  }

  subtotal(item: CartLine): number {
    return item.quantity * item.unitPrice;
  }
}
