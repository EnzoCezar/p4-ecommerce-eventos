export interface OrderItemData {
  id: number;
  name: string;
  type: string;
  price: number;
  quantity: number;
}

export interface CreateOrderData {
  customer: string;
  items: OrderItemData[];
  total: number;
  status: string;
}

export interface SavedOrder {
  id: number;
}

export interface Order {
  id: number;
  customer: string;
  items: OrderItemData[];
  total: number;
  status: string;
  createdAt: Date;
}

export interface IOrderRepository {
  create(data: CreateOrderData): Promise<SavedOrder>;
  findById(id: number): Promise<Order | null>;
}