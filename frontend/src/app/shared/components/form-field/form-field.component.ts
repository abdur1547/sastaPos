import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { map, switchMap } from 'rxjs';

type FieldType = 'text' | 'email' | 'password';

const ERROR_MESSAGES: Record<string, (error: unknown) => string> = {
  required: () => 'This field is required.',
  email: () => 'Enter a valid email address.',
  minlength: (error) => `Must be at least ${(error as { requiredLength: number }).requiredLength} characters.`,
  maxlength: (error) => `Must be at most ${(error as { requiredLength: number }).requiredLength} characters.`,
  mismatch: () => 'Passwords do not match.',
  server: (error) => String(error),
};

/** Material outlined input bound to a typed reactive form control, with consistent error text. */
@Component({
  selector: 'app-form-field',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule],
  templateUrl: './form-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormFieldComponent {
  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly type = input<FieldType>('text');
  readonly autocomplete = input<string>('off');
  readonly placeholder = input<string>('');
  readonly icon = input<string>('');

  protected readonly passwordVisible = signal(false);
  protected readonly inputType = computed(() =>
    this.type() === 'password' && this.passwordVisible() ? 'text' : this.type(),
  );

  private readonly controlEvents = toSignal(
    toObservable(this.control).pipe(
      switchMap((control) => control.events),
      map(() => ({})),
    ),
    { initialValue: {} },
  );

  protected readonly errorMessage = computed(() => {
    this.controlEvents();
    return firstErrorMessage(this.control().errors);
  });

  protected togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }
}

function firstErrorMessage(errors: ValidationErrors | null): string {
  if (!errors) {
    return '';
  }
  const [key, value] = Object.entries(errors)[0];
  return ERROR_MESSAGES[key]?.(value) ?? 'This value is invalid.';
}
