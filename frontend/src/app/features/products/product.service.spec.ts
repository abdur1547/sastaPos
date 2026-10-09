import { TestBed } from "@angular/core/testing";

import { AuthService } from "../../core/auth/auth.service";
import { ProductRepository } from "./product.repository";
import { ProductService } from "./product.service";

jest.mock("../../core/powersync/powersync.service", () => ({
  PowerSyncService: class PowerSyncService {},
}));

const STORE_ID = "8f2fcf9e-44f8-45fc-a319-761910940071";
const UNIT_ID = "7b34a868-e7dd-4e39-8c24-4c301adf73fe";
const TAX_ID = "36a10d1c-eeb3-48e8-8c44-0ce74be0c969";

describe("ProductService", () => {
  const repository = {
    create: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    watch: jest.fn(),
  };
  let storeId: string | null;
  let service: ProductService;

  beforeEach(() => {
    jest.resetAllMocks();
    storeId = STORE_ID;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => ({ storeId }) } },
        { provide: ProductRepository, useValue: repository },
      ],
    });
    service = TestBed.inject(ProductService);
  });

  it("normalizes product fields and supplies backend-compatible defaults", async () => {
    repository.create.mockImplementation(async (product) => product);

    const product = await service.create({
      name: "  Tea  ",
      pctCode: " PCT-1 ",
      unitPrice: "12",
      unitsOfMeasureId: UNIT_ID,
      taxCategoryIds: [TAX_ID, TAX_ID],
      description: "",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Tea",
        pctCode: "PCT-1",
        unitPrice: "12.00",
        stockQuantity: "0.00",
        status: "ACTIVE",
        description: "",
        taxCategoryIds: [TAX_ID],
        storeId: STORE_ID,
      }),
    );
    expect(product.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("rejects decimal values outside the backend precision and scale", async () => {
    await expect(
      service.create({
        name: "Tea",
        pctCode: "PCT-1",
        unitPrice: "1.234",
        unitsOfMeasureId: UNIT_ID,
      }),
    ).rejects.toThrow("unitPrice must be a non-negative decimal");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an empty update request", () => {
    expect(() => service.update(TAX_ID, {})).toThrow(
      "At least one editable product field",
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("requires a store from the locally restored session", () => {
    storeId = null;

    expect(() => service.list()).toThrow("A valid store must be selected");
    expect(repository.list).not.toHaveBeenCalled();
  });
});
