import { inject, injectable } from 'inversify';
import { TYPES } from '../container/types';
import { Request, Response } from 'express';
import { BusinessError } from '../domain/BusinessError';
import logger from '../lib/logger';
import { OrderService } from '../services/OrderService';
import { OrderNotFoundError } from '../domain/OrderNotFoundError';

@injectable()
export class OrderController {
  constructor(@inject(TYPES.OrderService) private readonly orderService: OrderService) { }

  async processOrder(req: Request, res: Response) {
    try {
      const { customer, items, paymentMethod, paymentDetails } = req.body;

      const result = await this.orderService.execute({
        customer,
        items,
        paymentMethod,
        paymentDetails,
      });

      return res.json({
        message: 'Pedido processado com sucesso',
        orderId: result.orderId,
        emailPreview: result.emailPreview,
      });
    } catch (error: any) {
      if (error instanceof BusinessError) {
        return res.status(400).json({ error: error.message });
      }

      logger.error(`Erro ao processar pedido: ${error.message}`);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }

  async getOrder(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }

    try {
      const order = await this.orderService.findById(id);
      return res.status(200).json(order);
    } catch (error: any) {
      if (error instanceof OrderNotFoundError) {
        return res.status(404).json({ error: error.message });
      }

      logger.error(`Erro ao buscar pedido: ${error.message}`);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }
}