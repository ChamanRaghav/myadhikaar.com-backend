import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';

export interface CashfreeOrder {
  order_id: string;
  order_amount: number;
  order_status: string; // ACTIVE | PAID | EXPIRED | TERMINATED | ...
  order_note?: string;
  customer_details?: { customer_email?: string; customer_name?: string; customer_phone?: string };
}

export interface CashfreePayment {
  cf_payment_id: string | number;
  payment_status: string;
  payment_amount: number;
  payment_group?: string;
  payment_time?: string;
}

export interface NewOrder {
  order_id: string;
  amount: number;
  note: string;
  customer: { id: string; name: string; email: string; phone: string };
  return_url: string;
  notify_url?: string;
}

/** Thin wrapper over the Cashfree PG API (2023-08-01), replaceable in tests. */
@Injectable()
export class CashfreeClient {
  private readonly logger = new Logger(CashfreeClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get environment(): 'sandbox' | 'production' {
    const explicit = this.config.get('CASHFREE_ENV', { infer: true });
    if (explicit) return explicit;
    return this.config.get('CASHFREE_APP_ID', { infer: true })?.toUpperCase().startsWith('TEST') ? 'sandbox' : 'production';
  }

  async createOrder(order: NewOrder): Promise<{ payment_session_id: string }> {
    const res = await this.call('/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.order_id,
        order_amount: order.amount,
        order_currency: 'INR',
        order_note: order.note.slice(0, 200),
        customer_details: {
          customer_id: order.customer.id,
          customer_name: order.customer.name.slice(0, 50),
          customer_email: order.customer.email,
          customer_phone: order.customer.phone,
        },
        order_meta: { return_url: order.return_url, ...(order.notify_url ? { notify_url: order.notify_url } : {}) },
      }),
    });
    const data = (await res.json()) as { payment_session_id?: string; message?: string };
    if (!res.ok || !data.payment_session_id) {
      this.logger.warn(`Cashfree order creation failed: ${data.message ?? res.status}`);
      throw new ServiceUnavailableException(data.message || 'Payment gateway error');
    }
    return { payment_session_id: data.payment_session_id };
  }

  async getOrder(orderId: string): Promise<CashfreeOrder | null> {
    const res = await this.call(`/orders/${encodeURIComponent(orderId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new ServiceUnavailableException('Payment gateway error');
    return (await res.json()) as CashfreeOrder;
  }

  async getSuccessfulPayment(orderId: string): Promise<CashfreePayment | null> {
    const res = await this.call(`/orders/${encodeURIComponent(orderId)}/payments`);
    if (!res.ok) return null;
    const payments = (await res.json()) as CashfreePayment[];
    return (Array.isArray(payments) ? payments : []).find((p) => p.payment_status === 'SUCCESS') ?? null;
  }

  /** Cashfree signs webhooks with base64(HMAC-SHA256(timestamp + rawBody, secret key)). */
  verifyWebhook(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean {
    const secret = this.config.get('CASHFREE_SECRET_KEY', { infer: true });
    if (!secret || !timestamp || !signature) return false;
    const expected = createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private call(path: string, init: RequestInit = {}): Promise<Response> {
    const appId = this.config.get('CASHFREE_APP_ID', { infer: true });
    const secret = this.config.get('CASHFREE_SECRET_KEY', { infer: true });
    if (!appId || !secret) throw new ServiceUnavailableException('Payments are not configured');
    const base = this.environment === 'sandbox' ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';
    return fetch(base + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': appId,
        'x-client-secret': secret,
        'x-api-version': '2023-08-01',
      },
    });
  }
}
