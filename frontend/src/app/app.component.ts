import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [MatButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly initial = computed(() => this.auth.user()?.name.trim().charAt(0).toUpperCase() ?? '');

  protected signOut(): Promise<void> {
    return this.auth.logout();
  }
  
  async ngOnInit(): Promise<void> {}

  async ngOnDestroy(): Promise<void> {}
}
