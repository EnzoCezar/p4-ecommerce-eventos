import { BusinessError } from './BusinessError';

export class OrderNotFoundError extends BusinessError {
  constructor(id: number) {
    super(`Pedido ${id} não encontrado`);
    this.name = 'OrderNotFoundError';
  }
}