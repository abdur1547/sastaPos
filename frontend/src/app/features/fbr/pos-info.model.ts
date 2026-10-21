/** POS-level identity required by FBR; mirrors the backend `PosInfoDTO` / synced `pos_info` row. Holds no secrets. */
export interface PosInfo {
  readonly id: string;
  readonly posId: string | null;
  readonly posName: string | null;
  readonly registrationNumber: string | null;
  readonly softwareName: string | null;
  readonly softwareVersion: string | null;
  readonly vendorName: string | null;
  readonly vendorNtn: string | null;
  readonly isActive: boolean;
}
