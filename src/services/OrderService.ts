import { inject, injectable } from 'inversify';
import { TYPES } from '../container/types';
import { BusinessError } from '../domain/BusinessError';
import { ProductFactory } from '../domain/ProductFactory';
import logger from '../lib/logger';
import { PaymentDetails } from '../payments/IPaymentMethod';
import { PaymentMethodRegistry } from '../payments/PaymentMethodRegistry';
import { IOrderRepository, Order, OrderItemData } from '../repositories/IOrderRepository';
import { IProductRepository } from '../repositories/IProductRepository';
import { IOrderQueue } from '../queues/IOrderQueue';
import { OrderNotFoundError } from '../domain/OrderNotFoundError';

export interface OrderItemInput {
  productId: number;
  quantity: number;
}

export interface ProcessOrderInput {
  customer: string;
  items: OrderItemInput[];
  paymentMethod: string;
  paymentDetails: PaymentDetails;
}

export interface ProcessOrderResult {
  orderId: number;
}

@injectable()
export class OrderService {
  constructor(
    @inject(TYPES.OrderRepository) private readonly orderRepository: IOrderRepository,
    @inject(TYPES.ProductRepository) private readonly productRepository: IProductRepository,
    @inject(TYPES.ProductFactory) private readonly productFactory: ProductFactory,
    @inject(TYPES.PaymentMethodRegistry) private readonly paymentMethods: PaymentMethodRegistry,
    @inject(TYPES.OrderQueue) private readonly orderQueue: IOrderQueue,
  ) {}

  async execute(input: ProcessOrderInput): Promise<ProcessOrderResult> {
    const { customer, items, paymentMethod, paymentDetails } = input;

    // 1. Valida
    if (!items || items.length === 0) {
      logger.error('Tentativa de pedido sem itens');
      throw new BusinessError('Carrinho vazio');
    }

    // 2. Calcula
    let totalAmount = 0;
    const orderItems: OrderItemData[] = [];

    for (const item of items) {
      const data = await this.productRepository.findById(item.productId);

      if (!data) {
        throw new BusinessError(`Produto ${item.productId} não encontrado`);
      }

      const product = this.productFactory.create(data);

      totalAmount += product.price * item.quantity + product.calculateFreight();

      orderItems.push({
        id: product.id,
        name: product.name,
        type: product.type,
        price: product.price,
        quantity: item.quantity,
      });
    }

    // 3. Paga
    const payment = this.paymentMethods.get(paymentMethod);
    await payment.process(paymentDetails);

    // 4. Salva
    const order = await this.orderRepository.create({
      customer,
      items: orderItems,
      total: totalAmount,
      status: 'confirmed',
    });

    // 5. Publica na fila
    await this.orderQueue.publish({
      orderId: order.id,
      customer,
      total: totalAmount,
      productNames: orderItems.map((item) => item.name),
    });

    return { orderId: order.id };
  }

  async findById(id: number): Promise<Order> {
    const order = await this.orderRepository.findById(id);
    if (order === null) {
      throw new OrderNotFoundError(id);
    }
  
    return order;
  }
}