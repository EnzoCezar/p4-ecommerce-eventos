import { OrderConfirmation } from '../services/NotificationService';

export interface IOrderQueue {
  publish(order: OrderConfirmation): Promise<void>;
}