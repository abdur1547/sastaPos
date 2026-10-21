import { TestBed } from "@angular/core/testing";

import { DatabaseService } from "../../core/database/database.service";
import { PosInfoRepository } from "./pos-info.repository";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

describe("PosInfoRepository", () => {
  const getOptional = jest.fn();
  let repository: PosInfoRepository;

  beforeEach(() => {
    getOptional.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: { getOptional } }],
    });
    repository = TestBed.inject(PosInfoRepository);
  });

  it("maps the local pos_info row to the domain model", async () => {
    getOptional.mockResolvedValue({
      id: "1",
      pos_id: "05",
      pos_name: "Sasta POS",
      registration_number: null,
      software_name: "Sasta POS",
      software_version: "1.0.0",
      vendor_name: null,
      vendor_ntn: "1234567",
      is_active: 1,
    });

    await expect(repository.get()).resolves.toEqual({
      id: "1",
      posId: "05",
      posName: "Sasta POS",
      registrationNumber: null,
      softwareName: "Sasta POS",
      softwareVersion: "1.0.0",
      vendorName: null,
      vendorNtn: "1234567",
      isActive: true,
    });
  });

  it("returns null before the first sync", async () => {
    getOptional.mockResolvedValue(null);

    await expect(repository.get()).resolves.toBeNull();
  });
});
