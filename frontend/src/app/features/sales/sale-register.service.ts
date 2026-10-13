import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { SaleDetailRepository } from "./data/sale-detail.repository";
import { SaleRegisterRepository } from "./data/sale-register.repository";
import { SaleVoidRepository } from "./data/sale-void.repository";
import { resolveSoldAtRange } from "./domain/sale-date-range";
import {
  VoidDecision,
  evaluateVoid,
  validateVoidReason,
} from "./domain/sale-void.policy";
import { SaleDetail, SaleDetailHeader } from "./models/sale-detail.model";
import {
  CashierOption,
  SalePage,
  SalePageRequest,
  SaleRegisterFilters,
  SaleRegisterSummary,
  SaleSort,
} from "./models/sale-register.model";
import {
  SaleRegisterValidationError,
  SaleVoidRefusedError,
} from "./sales.errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Application service for the sales register: scoping, date resolution and the void workflow. */
@Injectable({ providedIn: "root" })
export class SaleRegisterService {
  private readonly auth = inject(AuthService);
  private readonly register = inject(SaleRegisterRepository);
  private readonly details = inject(SaleDetailRepository);
  private readonly voids = inject(SaleVoidRepository);

  watchPage(
    filters: SaleRegisterFilters,
    sort: SaleSort,
    request: SalePageRequest,
  ): Observable<SalePage> {
    return this.register.watchPage(this.query(filters), sort, request);
  }

  watchSummary(filters: SaleRegisterFilters): Observable<SaleRegisterSummary> {
    return this.register.watchSummary(this.query(filters));
  }

  watchCashiers(): Observable<readonly CashierOption[]> {
    return this.register.watchCashiers(this.requireStoreId());
  }

  watchDetail(id: string): Observable<SaleDetail | null> {
    if (!UUID_PATTERN.test(id)) {
      throw new SaleRegisterValidationError("This sale link is not valid.");
    }
    return this.details.watchDetail(id, this.requireStoreId());
  }

  /** Whether the signed-in user may void this sale, with a user-facing reason when not. */
  canVoid(sale: SaleDetailHeader, now: Date = new Date()): VoidDecision {
    const user = this.auth.user();
    if (!user) {
      return { allowed: false, reason: "Sign in to void sales." };
    }
    return evaluateVoid(
      { status: sale.status, cashierId: sale.cashier.id, soldAt: sale.soldAt },
      { id: user.id, role: user.role },
      now,
    );
  }

  async voidSale(sale: SaleDetailHeader, reason: string): Promise<void> {
    const decision = this.canVoid(sale);
    if (!decision.allowed) {
      throw new SaleVoidRefusedError(decision.reason);
    }
    const validated = validateVoidReason(reason);
    if (!validated.ok) {
      throw new SaleRegisterValidationError(validated.message);
    }
    await this.voids.voidSale({
      saleId: sale.id,
      storeId: this.requireStoreId(),
      userId: this.auth.user()!.id,
      reason: validated.value,
    });
  }

  private query(filters: SaleRegisterFilters) {
    return {
      storeId: this.requireStoreId(),
      filters,
      range: resolveSoldAtRange(filters.datePreset, filters.customFrom, filters.customTo),
    };
  }

  private requireStoreId(): string {
    const storeId = this.auth.user()?.storeId;
    if (!storeId || !UUID_PATTERN.test(storeId)) {
      throw new SaleRegisterValidationError(
        "A valid store must be selected before viewing sales.",
      );
    }
    return storeId;
  }
}
