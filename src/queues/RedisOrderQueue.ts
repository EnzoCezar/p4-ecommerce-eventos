import { injectable } from 'inversify';
import { createClient } from 'redis';
import { OrderConfirmation } from '../services/NotificationService';
import { IOrderQueue } from './IOrderQueue';

export const ORDER_QUEUE_KEY = 'orders:email';

@injectable()
export class RedisOrderQueue implements IOrderQueue {
  private readonly client = createClient({ url: process.env.REDIS_URL });
  private connecting: Promise<unknown> | null = null;

  private async connect() {
    if (!this.connecting) {
      this.connecting = this.client.connect();
    }
    await this.connecting;
  }

  async publish(order: OrderConfirmation): Promise<void> {
    await this.connect();
    await this.client.lPush(ORDER_QUEUE_KEY, JSON.stringify(order));
  }
}