import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { BaseApiService } from "../../core/http/base-api.service";
import {
  Store,
  StoreSettings,
  UpdateStoreRequest,
  UpdateStoreSettingsRequest,
} from "./store.model";

@Injectable({ providedIn: "root" })
export class StoreApiService extends BaseApiService {
  getStore(): Observable<Store> {
    return this.get<Store>("/api/store");
  }

  updateStore(request: UpdateStoreRequest): Observable<Store> {
    return this.patch<Store, UpdateStoreRequest>("/api/store", request);
  }

  updateSettings(
    request: UpdateStoreSettingsRequest,
  ): Observable<StoreSettings> {
    return this.patch<StoreSettings, UpdateStoreSettingsRequest>(
      "/api/store/settings",
      request,
    );
  }
}
