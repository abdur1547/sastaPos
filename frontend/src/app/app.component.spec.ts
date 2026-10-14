import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';
import { AuthenticatedUser } from './core/auth/auth.model';
import { OnboardingProgressService } from './core/onboarding/onboarding-progress.service';
import { environment } from '../environments/environment';

describe('AppComponent', () => {
  const logout = jest.fn();
  const user = signal<AuthenticatedUser>({
    id: 'cashier', name: 'Cashier', email: 'cashier@example.com',
    role: 'CASHIER', status: 'ACTIVE', storeId: 'store',
  });

  beforeEach(async () => {
    logout.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    user.set({ id: 'cashier', name: 'Cashier', email: 'cashier@example.com', role: 'CASHIER', status: 'ACTIVE', storeId: 'store' });
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            user,
            logout,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('omits the day/date and Help while retaining profile and sign out', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const header: HTMLElement = fixture.nativeElement.querySelector('.topbar');
    expect(header.querySelector('.topbar-date')).toBeNull();
    expect(header.textContent).not.toContain('Help');
    expect(header.textContent).toContain('Cashier');
    const signOut = header.querySelector<HTMLButtonElement>('.sign-out-button');
    expect(signOut?.textContent).toContain('Sign out');
    signOut?.click();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('exposes the development Test Scan screen in navigation', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/dev/test-scan"]');
    expect(link?.textContent).toContain('Test Scan (dev)');
    const receipt: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/dev/receipt-preview"]');
    expect(receipt?.textContent).toContain('Receipt Preview (dev)');
  });

  it('keeps storeless signup cashiers and newly promoted owners on setup navigation', () => {
    user.update((current) => ({ ...current, storeId: null }));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/onboarding"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.navigation a[href="/sell"]')).toBeNull();
    const progress = TestBed.inject(OnboardingProgressService);
    progress.save(0);
    user.update((current) => ({ ...current, role: 'OWNER', storeId: 'store' }));
    progress.save(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/onboarding"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.navigation a[href="/sell"]')).toBeNull();
  });

  it('omits Test Scan navigation in production', () => {
    const originalProduction = environment.production;
    environment.production = true;
    try {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('a[href="/dev/test-scan"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('a[href="/dev/receipt-preview"]')).toBeNull();
    } finally {
      environment.production = originalProduction;
    }
  });
});
