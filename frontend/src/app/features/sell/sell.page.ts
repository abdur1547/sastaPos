import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CustomerToolbarComponent } from './components/customer-toolbar/customer-toolbar.component';
import { PendingBillsBarComponent } from './components/pending-bills-bar/pending-bills-bar.component';
import { ProductToolbarComponent } from './components/product-toolbar/product-toolbar.component';
import { SaleActionsComponent } from './components/sale-actions/sale-actions.component';
import { SaleItemsTableComponent } from './components/sale-items-table/sale-items-table.component';
import { SaleSummaryComponent } from './components/sale-summary/sale-summary.component';
import { TMP_CUSTOMERS, TMP_PENDING_BILLS, TMP_PRODUCTS } from './data/sell-tmp-data';
import { CartLine, Customer, PendingBill, Product } from './models/sell.model';

@Component({
  selector: 'app-sell-page',
  imports: [
    CustomerToolbarComponent,
    PendingBillsBarComponent,
    ProductToolbarComponent,
    SaleActionsComponent,
    SaleItemsTableComponent,
    SaleSummaryComponent,
  ],
  templateUrl: './sell.page.html',
  styleUrl: './sell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellPage {
  readonly pendingBills = signal<PendingBill[]>(TMP_PENDING_BILLS);
  readonly customers = signal<Customer[]>(TMP_CUSTOMERS);
  readonly products = signal<Product[]>(TMP_PRODUCTS);
  readonly selectedCustomer = signal<Customer | null>(null);
  readonly cartLines = signal<CartLine[]>([]);
  readonly discount = signal(0);

  readonly totalQuantity = computed(() => this.cartLines().reduce((sum, line) => sum + line.quantity, 0));
  readonly subtotal = computed(() => this.cartLines().reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  readonly totalPayable = computed(() => Math.max(0, this.subtotal() - this.discount()));

  onResumeBill(_billId: string): void {
    // Loading a pending bill's items back into the cart will land with the pending-bills service.
  }

  onRemoveBill(billId: string): void {
    this.pendingBills.update((bills) => bills.filter((bill) => bill.id !== billId));
  }

  onCustomerSelected(customer: Customer): void {
    this.selectedCustomer.set(customer);
  }

  onAddCustomer(): void {
    // Opening the create-customer flow will be wired up once that feature exists.
  }

  onSearchCustomers(_term: string): void {
    // Dedicated customer search will be wired up once that feature exists.
  }

  onProductSelected(product: Product): void {
    this.cartLines.update((lines) => {
      const existing = lines.find((line) => line.productId === product.id);
      if (existing) {
        return lines.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...lines, { productId: product.id, name: product.name, unitPrice: product.unitPrice, quantity: 1 }];
    });
  }

  onQuantityChanged(change: { productId: string; quantity: number }): void {
    this.cartLines.update((lines) =>
      lines.map((line) => (line.productId === change.productId ? { ...line, quantity: change.quantity } : line)),
    );
  }

  onRemoveItem(productId: string): void {
    this.cartLines.update((lines) => lines.filter((line) => line.productId !== productId));
  }

  onAddProduct(): void {
    // Opening the create-product flow will be wired up once that feature exists.
  }

  onCreateReturn(): void {
    // Return-order flow will be wired up once that feature exists.
  }

  onSearchProducts(_term: string): void {
    // Dedicated product search will be wired up once that feature exists.
  }

  onDiscountChanged(discount: number): void {
    this.discount.set(discount);
  }

  onAddToPending(): void {
    if (!this.cartLines().length) {
      return;
    }
    const nextOrderNumber = this.pendingBills().length + 1;
    this.pendingBills.update((bills) => [
      ...bills,
      { id: `bill-${Date.now()}`, label: `Order ${nextOrderNumber}` },
    ]);
    this.resetSale();
  }

  onCancelSale(): void {
    this.resetSale();
  }

  onPay(): void {
    this.resetSale();
  }

  private resetSale(): void {
    this.cartLines.set([]);
    this.discount.set(0);
    this.selectedCustomer.set(null);
  }
}