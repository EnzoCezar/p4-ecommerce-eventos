import { injectable } from 'inversify';
import { CreateOrderData, IOrderRepository, Order, SavedOrder } from './IOrderRepository';

@injectable()
export class InMemoryOrderRepository implements IOrderRepository {
  private readonly orders: Order[] = [];
  private nextId = 1;

  async create(data: CreateOrderData): Promise<SavedOrder> {
    const order: Order = { id: this.nextId++, ...data, createdAt: new Date() };
    this.orders.push(order);
    return { id: order.id };
  }

  async findById(id: number): Promise<Order | null> {
    return this.orders.find((order) => order.id === id) ?? null;
  }
}