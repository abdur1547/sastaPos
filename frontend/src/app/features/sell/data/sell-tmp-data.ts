import { Customer, PendingBill, Product } from "../models/sell.model";

// Temporary placeholder data until the counter, customer and catalog services are wired up.
export const TMP_PENDING_BILLS: PendingBill[] = [
  { id: "bill-1", label: "Order 1" },
  { id: "bill-2", label: "Order 2" },
];

export const TMP_CUSTOMERS: Customer[] = [
  { id: "cust-1", name: "Ali Raza", phone: "0300-1112223" },
  { id: "cust-2", name: "Sana Tariq", phone: "0333-4445556" },
  { id: "cust-3", name: "Bilal Ahmed", phone: "0321-7778889" },
  { id: "cust-4", name: "Hina Fatima", phone: "0345-9990001" },
];

export const TMP_PRODUCTS: Product[] = [
  { id: "prod-1", name: "Basmati Rice 5kg", unitPrice: 1450 },
  { id: "prod-2", name: "Cooking Oil 1L", unitPrice: 650 },
  { id: "prod-3", name: "Sugar 1kg", unitPrice: 160 },
  { id: "prod-4", name: "Wheat Flour 10kg", unitPrice: 1900 },
  { id: "prod-5", name: "Tea Pack 190g", unitPrice: 320 },
  { id: "prod-6", name: "Salt 800g", unitPrice: 60 },
];
