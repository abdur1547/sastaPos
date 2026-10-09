import { CustomerStatus } from "../../customer.model";

export interface CustomerFormValue {
  readonly name: string;
  readonly phoneNumber: string;
  readonly ntn: string;
  readonly status: CustomerStatus;
}
