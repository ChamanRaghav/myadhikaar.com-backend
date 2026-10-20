import { createHmac } from 'node:crypto';
import type { CashfreeOrder, CashfreePayment, NewOrder } from '../src/payments/cashfree.client.js';

export const CF_SECRET = 'cashfree-test-secret';

/** In-memory Cashfree: tests decide when (and for how much) an order gets paid. */
export class FakeCashfree {
  readonly environment = 'sandbox' as const;
  readonly orders = new Map<string, CashfreeOrder & { request: NewOrder }>();
  calls = { getOrder: 0 };

  async createOrder(order: NewOrder) {
    this.orders.set(order.order_id, { order_id: order.order_id, order_amount: order.amount, order_status: 'ACTIVE', request: order });
    return { payment_session_id: `session_${order.order_id}` };
  }

  async getOrder(orderId: string): Promise<CashfreeOrder | null> {
    this.calls.getOrder++;
    return this.orders.get(orderId) ?? null;
  }

  async getSuccessfulPayment(orderId: string): Promise<CashfreePayment | null> {
    const o = this.orders.get(orderId);
    return o?.order_status === 'PAID' ? { cf_payment_id: 1234, payment_status: 'SUCCESS', payment_amount: o.order_amount, payment_group: 'upi' } : null;
  }

  verifyWebhook(rawBody: string, timestamp?: string, signature?: string): boolean {
    return !!timestamp && signature === sign(rawBody, timestamp);
  }

  /** Marks an order paid, optionally with a different amount than requested. */
  pay(orderId: string, amount?: number): void {
    const o = this.orders.get(orderId)!;
    o.order_status = 'PAID';
    if (amount !== undefined) o.order_amount = amount;
  }

  expire(orderId: string): void {
    this.orders.get(orderId)!.order_status = 'EXPIRED';
  }
}

export function sign(rawBody: string, timestamp: string): string {
  return createHmac('sha256', CF_SECRET).update(timestamp + rawBody).digest('base64');
}
