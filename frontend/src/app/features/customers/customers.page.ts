import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-customers-page',
  template: `
    <section class="page-heading">
      <p class="section-label">Directory</p>
      <h1>Customers</h1>
      <p>Manage your customer relationships here.</p>
    </section>
  `,
  styles: `
    .section-label { margin: 0 0 10px; color: var(--accent-coral); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; color: var(--ink-strong); font-family: var(--font-display); font-size: 36px; line-height: 1.1; letter-spacing: 0; }
    p:not(.section-label) { margin: 12px 0 0; color: var(--ink-muted); font-size: 16px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersPage {}