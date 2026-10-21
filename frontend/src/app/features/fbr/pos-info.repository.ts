import { Injectable, inject } from "@angular/core";
import { SqliteValue } from "@powersync/common";
import { Observable, map } from "rxjs";

import { DatabaseService } from "../../core/database/database.service";
import { PosInfo } from "./pos-info.model";

interface PosInfoRow {
  readonly id: string;
  readonly pos_id: string | null;
  readonly pos_name: string | null;
  readonly registration_number: string | null;
  readonly software_name: string | null;
  readonly software_version: string | null;
  readonly vendor_name: string | null;
  readonly vendor_ntn: string | null;
  readonly is_active: number | null;
  [key: string]: SqliteValue;
}

const POS_INFO_SELECT = `
  SELECT id, pos_id, pos_name, registration_number, software_name,
         software_version, vendor_name, vendor_ntn, is_active
  FROM pos_info
  ORDER BY date_created ASC
  LIMIT 1`;

export function mapPosInfo(row: PosInfoRow): PosInfo {
  return {
    id: row.id,
    posId: row.pos_id,
    posName: row.pos_name,
    registrationNumber: row.registration_number,
    softwareName: row.software_name,
    softwareVersion: row.software_version,
    vendorName: row.vendor_name,
    vendorNtn: row.vendor_ntn,
    isActive: Boolean(row.is_active),
  };
}

/** Read-only access to the PowerSync-downloaded POS info; works fully offline. */
@Injectable({ providedIn: "root" })
export class PosInfoRepository {
  private readonly database = inject(DatabaseService);

  async get(): Promise<PosInfo | null> {
    const row = await this.database.getOptional<PosInfoRow>(POS_INFO_SELECT);
    return row ? mapPosInfo(row) : null;
  }

  watch(): Observable<PosInfo | null> {
    return this.database
      .watch(POS_INFO_SELECT)
      .pipe(map((rows) => (rows.length > 0 ? mapPosInfo(rows[0] as PosInfoRow) : null)));
  }
}
