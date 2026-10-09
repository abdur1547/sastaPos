export interface UnitOfMeasureOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

export interface TaxCategoryOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly rate: number;
}
