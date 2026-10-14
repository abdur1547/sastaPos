import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { OnboardingProgressService } from './core/onboarding/onboarding-progress.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [CdkScrollable, MatButtonModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected readonly development = !environment.production;
  protected readonly auth = inject(AuthService);
  protected readonly onboarding = inject(OnboardingProgressService);
  protected readonly initial = computed(() => this.auth.user()?.name.trim().charAt(0).toUpperCase() ?? '');

  protected signOut(): Promise<void> {
    return this.auth.logout();
  }
}
