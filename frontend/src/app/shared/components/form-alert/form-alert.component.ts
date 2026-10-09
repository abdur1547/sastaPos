import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type AlertTone = 'error' | 'warning' | 'success';

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-(--accent-coral) bg-red-50 text-red-900',
  warning: 'border-(--accent-amber) bg-amber-50 text-amber-900',
  success: 'border-(--accent-teal) bg-teal-50 text-teal-900',
};

/** Inline status message for forms. */
@Component({
  selector: 'app-form-alert',
  templateUrl: './form-alert.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormAlertComponent {
  readonly tone = input<AlertTone>('error');
  protected readonly classes = computed(() => TONE_CLASSES[this.tone()]);
  protected readonly role = computed(() => (this.tone() === 'error' ? 'alert' : 'status'));
}
