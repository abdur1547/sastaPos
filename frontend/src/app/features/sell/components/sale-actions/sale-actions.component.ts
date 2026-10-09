import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sale-actions',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './sale-actions.component.html',
  styleUrl: './sale-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleActionsComponent {
  readonly addToPending = output<void>();
  readonly cancelSale = output<void>();
  readonly pay = output<void>();
}
