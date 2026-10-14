import { Injectable, inject, signal } from "@angular/core";

import { AuthService } from "../auth/auth.service";

export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5;

/** Only the setup checkpoint is stored; records and drafts are never cached. */
@Injectable({ providedIn: "root" })
export class OnboardingProgressService {
  private readonly auth = inject(AuthService);
  private readonly revision = signal(0);

  step(): OnboardingStep | null {
    this.revision();
    const user = this.auth.user();
    if (!user || user.role === "GLOBAL_ADMIN") return null;
    if (!user.storeId) return 0;
    if (user.role !== "OWNER") return null;
    const value = localStorage.getItem(this.key(user.id));
    if (value !== null && /^[0-5]$/.test(value)) {
      return Number(value) as OnboardingStep;
    }
    return null;
  }

  required(): boolean {
    const step = this.step();
    return step !== null && step < 5;
  }

  save(step: OnboardingStep): void {
    const user = this.auth.user();
    if (!user) throw new Error("Sign in to continue store setup.");
    localStorage.setItem(this.key(user.id), String(step));
    this.revision.update((value) => value + 1);
  }

  private key(userId: string): string {
    return `counter:onboarding:${userId}`;
  }
}
