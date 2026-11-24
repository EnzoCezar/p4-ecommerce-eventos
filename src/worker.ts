import 'reflect-metadata';
import 'dotenv/config';
import { createClient } from 'redis';
import { container } from './container/container';
import { TYPES } from './container/types';
import { NotificationService } from './services/NotificationService';
import { ORDER_QUEUE_KEY } from './queues/RedisOrderQueue';
import logger from './lib/logger';

async function main() {
  const notificationService = container.get<NotificationService>(TYPES.NotificationService);
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  logger.info('Worker aguardando pedidos...');

  while (true) {
    const result = await client.brPop(ORDER_QUEUE_KEY, 0);
    if (!result) continue;

    try {
      const order = JSON.parse(result.element);
      const preview = await notificationService.sendOrderConfirmation(order);
      logger.info(`Email do pedido #${order.orderId} enviado: ${preview}`);
    } catch (error: any) {
      logger.error(`Falha ao enviar email: ${error.message}`);
    }
  }
}

main().catch((error) => {
  logger.error(`Worker caiu: ${error.message}`);
  process.exit(1);
});