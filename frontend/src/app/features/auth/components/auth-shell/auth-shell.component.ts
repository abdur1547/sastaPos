import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Centered, branded frame shared by every authentication page. */
@Component({
  selector: 'app-auth-shell',
  templateUrl: './auth-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
