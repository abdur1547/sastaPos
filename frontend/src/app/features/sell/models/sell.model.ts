export interface PendingBill {
  id: string;
  label: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
}

export interface Product {
  id: string;
  name: string;
  unitPrice: number;
}

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}
