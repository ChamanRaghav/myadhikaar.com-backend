import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomInt } from 'node:crypto';
import { isAdmin, type AuthUser } from '../common/auth-user.js';
import { runExclusive } from '../common/cron-lock.js';
import { escapeHtml } from '../common/html.js';
import { newOrderId } from '../common/ids.js';
import type { Env } from '../config/env.js';
import { Prisma, type PaymentOrder } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { money, WalletService } from '../wallet/wallet.service.js';
import { CashfreeClient, type CashfreePayment } from './cashfree.client.js';
import type { CreatePaymentDto, QuoteDto, RglOrderDto } from './dto.js';
import { quoteRgl, quoteService, quoteWallet, WALLET_COUPONS, type RglQuote } from './pricing.js';

type Tx = Prisma.TransactionClient;
type AfterCommit = () => Promise<unknown>;

interface RglMeta {
  quote: RglQuote;
  buyer: { name: string; phone: string; city?: string };
  vehicles: RglOrderDto['vehicles'];
  referral_code?: string;
  referrer_email?: string;
  pending_cases_details?: string;
}

const RETURN_PATHS = {
  wallet_recharge: '/wallet-recharge-success',
  service: '/service-order-success',
  rgl_subscription: '/payment-success',
} as const;

const FAILED_STATES = ['EXPIRED', 'TERMINATED', 'CANCELLED'];
const GST_RATE = 0.18;
const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashfree: CashfreeClient,
    private readonly wallet: WalletService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Prices shown before paying; the same functions decide the real charge. */
  async quote(dto: QuoteDto) {
    switch (dto.purpose) {
      case 'wallet_recharge':
        return quoteWallet(dto.wallet?.amount, dto.wallet?.coupon);
      case 'service':
        return quoteService(dto.service_slug ?? '', dto.package_name);
      case 'rgl_subscription':
        if (!dto.rgl) throw new BadRequestException('rgl details are required');
        return quoteRgl(this.prisma, dto.rgl);
    }
  }

  async create(user: AuthUser, dto: CreatePaymentDto) {
    let amount: number;
    let meta: Record<string, unknown>;
    let note: string;
    let phone = dto.phone;

    switch (dto.purpose) {
      case 'wallet_recharge': {
        const q = quoteWallet(dto.wallet?.amount, dto.wallet?.coupon);
        if (q.coupon && WALLET_COUPONS[q.coupon].oncePerUser) {
          const used = await this.prisma.paymentOrder.count({
            where: { user_email: user.email, status: { in: ['paid', 'fulfilled'] }, meta: { path: ['coupon'], equals: q.coupon } },
          });
          if (used) throw new BadRequestException('You have already used this coupon');
        }
        amount = q.charge;
        meta = { credit: q.credit, bonus: q.bonus, coupon: q.coupon ?? null };
        note = `MyAdhikaar Wallet Recharge${q.coupon ? ` (Coupon: ${q.coupon})` : ''}${q.bonus ? ` (+₹${q.bonus} bonus)` : ''}`;
        break;
      }
      case 'service': {
        if (!dto.service) throw new BadRequestException('service details are required');
        const sr = await this.prisma.serviceRequest.findFirst({
          where: { id: dto.service.service_request_id, client_email: user.email },
        });
        if (!sr) throw new NotFoundException('Service request not found');
        if (sr.payment_status === 'paid') throw new BadRequestException('This service request is already paid');
        const q = quoteService(dto.service.service_slug ?? sr.service_title ?? '', sr.package_name);
        amount = q.price;
        meta = { service_request_id: sr.id, service_slug: q.slug, service_title: q.title, package_name: q.package_name };
        note = `${q.title}${q.package_name ? ` – ${q.package_name}` : ''}`;
        phone ??= sr.client_phone ?? undefined;
        break;
      }
      case 'rgl_subscription': {
        const r = dto.rgl;
        if (!r) throw new BadRequestException('rgl details are required');
        const q = await quoteRgl(this.prisma, r);
        if (r.vehicles.length > q.fleet_size) throw new BadRequestException('More vehicles than the fleet size');
        let referral: { referral_code: string | null; user_email: string | null } | null = null;
        if (r.referral_code?.trim()) {
          referral = await this.prisma.rGLReferral.findFirst({
            where: { referral_code: { equals: r.referral_code.trim(), mode: 'insensitive' }, is_active: true },
          });
          if (!referral) throw new BadRequestException('Invalid referral code');
          if (referral.user_email === user.email) throw new BadRequestException("You can't use your own referral code");
        }
        amount = q.amount;
        meta = {
          quote: q,
          buyer: { name: r.name, phone: r.phone, city: r.city },
          vehicles: r.vehicles,
          referral_code: referral?.referral_code ?? undefined,
          referrer_email: referral?.user_email ?? undefined,
          pending_cases_details: r.pending_cases_details,
        } satisfies RglMeta;
        note = `RoadGuard Legal ${q.plan_name} – ${q.fleet_size} vehicle(s), ${q.months} month(s)`;
        phone ??= r.phone;
        break;
      }
    }

    const prefix = { wallet_recharge: 'WLT', service: 'SRV', rgl_subscription: 'RGL' }[dto.purpose];
    const id = newOrderId(prefix);
    await this.prisma.paymentOrder.create({
      data: { id, user_email: user.email, purpose: dto.purpose, amount, meta: meta as Prisma.InputJsonValue },
    });
    if (dto.purpose === 'service') {
      // The success page finds the request by its order id
      await this.prisma.serviceRequest.update({ where: { id: String(meta.service_request_id) }, data: { payment_order_id: id } });
    }

    const appUrl = this.config.get('APP_URL', { infer: true });
    const apiUrl = this.config.get('API_URL', { infer: true });
    const profile = await this.prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const { payment_session_id } = await this.cashfree.createOrder({
      order_id: id,
      amount,
      note,
      customer: {
        id: user.email.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50),
        name: user.full_name || user.email,
        email: user.email,
        phone: normalizePhone(phone ?? profile?.phone),
      },
      return_url: `${appUrl}${RETURN_PATHS[dto.purpose]}?order_id=${id}`,
      notify_url: apiUrl ? `${apiUrl}/api/payments/webhook/cashfree` : undefined,
    });
    return { order_id: id, payment_session_id, amount, purpose: dto.purpose, environment: this.cashfree.environment };
  }

  /** Called by the return page: checks with Cashfree and fulfils the order if it's paid. */
  async verify(user: AuthUser, orderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || (order.user_email !== user.email && !isAdmin(user))) throw new NotFoundException('Order not found');
    return this.view(await this.sync(order));
  }

  async webhook(rawBody: string, timestamp?: string, signature?: string) {
    if (!this.cashfree.verifyWebhook(rawBody, timestamp, signature)) throw new UnauthorizedException('Bad signature');
    let orderId: string | undefined;
    try {
      orderId = JSON.parse(rawBody)?.data?.order?.order_id;
    } catch {
      throw new BadRequestException('Invalid payload');
    }
    const order = orderId ? await this.prisma.paymentOrder.findUnique({ where: { id: orderId } }) : null;
    // The payload only tells us which order to check; its status comes from Cashfree's API
    if (order) await this.sync(order);
    return { ok: true };
  }

  /** Safety net for missed webhooks and closed browsers. */
  @Cron('*/10 * * * *')
  async reconcile(): Promise<void> {
    if (!this.config.get('CRON_ENABLED', { infer: true })) return;
    await runExclusive(this.prisma, 'payments-reconcile', async () => {
      const pending = await this.prisma.paymentOrder.findMany({
        where: { status: 'created', created_date: { gt: new Date(Date.now() - DAY_MS), lt: new Date(Date.now() - 5 * 60_000) } },
        take: 100,
      });
      for (const order of pending) {
        await this.sync(order).catch((err: Error) => this.logger.warn(`Reconcile ${order.id}: ${err.message}`));
      }
    });
  }

  async sync(order: PaymentOrder): Promise<PaymentOrder> {
    if (order.status === 'fulfilled' || order.status === 'amount_mismatch') return order;
    const cf = await this.cashfree.getOrder(order.id);
    if (!cf) return order;
    if (cf.order_status === 'PAID') {
      if (money(cf.order_amount) !== money(order.amount)) {
        await this.prisma.paymentOrder.updateMany({ where: { id: order.id, status: { in: ['created', 'failed'] } }, data: { status: 'amount_mismatch' } });
        this.logger.error(`Order ${order.id}: paid ₹${cf.order_amount}, expected ₹${order.amount}`);
        this.mail.background(
          this.mail.notifyAdmins('Payment amount mismatch', `<p>Order <b>${escapeHtml(order.id)}</b> was paid ₹${cf.order_amount} but ₹${order.amount} was expected. It was not fulfilled.</p>`),
          'mismatch alert',
        );
      } else {
        await this.fulfill(order.id, await this.cashfree.getSuccessfulPayment(order.id));
      }
    } else if (FAILED_STATES.includes(cf.order_status) && order.status === 'created') {
      await this.prisma.paymentOrder.updateMany({ where: { id: order.id, status: 'created' }, data: { status: 'failed' } });
    }
    return this.prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
  }

  /** Fulfils a paid order exactly once, even when the webhook and return page race. */
  private async fulfill(orderId: string, payment: CashfreePayment | null): Promise<void> {
    const afterCommit: AfterCommit[] = [];
    await this.prisma.$transaction(
      async (tx) => {
        const claim = await tx.paymentOrder.updateMany({
          where: { id: orderId, status: { in: ['created', 'failed'] } },
          data: {
            status: 'paid',
            paid_at: new Date(),
            cf_payment_id: payment ? String(payment.cf_payment_id) : null,
            payment_method: payment?.payment_group ?? null,
          },
        });
        if (claim.count === 0) return; // already fulfilled by another request
        const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
        const result =
          order.purpose === 'wallet_recharge'
            ? await this.fulfillWallet(tx, order, afterCommit)
            : order.purpose === 'service'
              ? await this.fulfillService(tx, order, afterCommit)
              : await this.fulfillRgl(tx, order, afterCommit);
        await tx.paymentOrder.update({
          where: { id: orderId },
          data: { status: 'fulfilled', fulfilled_at: new Date(), meta: { ...(order.meta as object), result } as Prisma.InputJsonValue },
        });
      },
      { timeout: 30_000 },
    );
    for (const task of afterCommit) this.mail.background(task(), `after-payment task for ${orderId}`);
  }

  private async fulfillWallet(tx: Tx, order: PaymentOrder, after: AfterCommit[]) {
    const meta = order.meta as { credit: number; bonus: number };
    const email = order.user_email!;
    const { wallet, created } = await this.wallet.lock(tx, email);
    const updated = await this.wallet.credit(
      tx,
      wallet,
      meta.credit,
      { type: 'topup', description: `Wallet Recharge${meta.bonus ? ` (+₹${meta.bonus} bonus)` : ''}`, reference_id: order.id, payment_method: 'Cashfree' },
      meta.bonus,
    );
    after.push(async () => {
      this.wallet.announce(updated, created);
      const user = await this.prisma.user.findUnique({ where: { email } });
      const data = {
        userName: user?.full_name || email,
        email,
        amount: meta.credit,
        bonus: meta.bonus,
        newBalance: updated.balance,
        paymentMethod: 'Cashfree',
        transactionId: order.id,
      };
      await this.mail.sendTemplate('wallet_recharge', email, data);
      await this.mail.sendAdminCopy('wallet_recharge', email, data);
    });
    return { credit: meta.credit, bonus: meta.bonus, new_balance: updated.balance };
  }

  private async fulfillService(tx: Tx, order: PaymentOrder, after: AfterCommit[]) {
    const meta = order.meta as { service_request_id: string; service_title: string };
    const sr = await tx.serviceRequest.update({
      where: { id: meta.service_request_id },
      data: { payment_status: 'paid', amount_paid: order.amount, payment_order_id: order.id },
    });
    after.push(async () => {
      const data = {
        userName: sr.client_name || order.user_email,
        serviceName: meta.service_title,
        srNo: sr.service_request_no || sr.id,
        orderId: order.id,
        amount: order.amount,
        paymentMethod: order.payment_method || 'Online',
        paymentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        orderDate: isoDate(sr.created_date),
      };
      await this.mail.sendTemplate('service_payment_success', order.user_email!, data);
      await this.mail.sendAdminCopy('service_payment_success', order.user_email!, data);
    });
    return { service_request_id: sr.id };
  }

  private async fulfillRgl(tx: Tx, order: PaymentOrder, after: AfterCommit[]) {
    const meta = order.meta as unknown as RglMeta;
    const email = order.user_email!;
    const q = meta.quote;
    const today = new Date();
    const policy_number = await this.newPolicyNumber(tx);
    const activation_date = isoDate(new Date(today.getTime() + DAY_MS));
    const expiry_date = isoDate(new Date(today.getTime() + q.months * 30 * DAY_MS));
    const owner = await tx.fleetOwner.findFirst({ where: { user_email: email } });

    for (const v of meta.vehicles) {
      if (!v.vehicle_reg || !v.driver_name) continue;
      const vehicle = await tx.fleetVehicle.create({
        data: {
          vehicle_number: v.vehicle_reg.toUpperCase(),
          vehicle_type: v.vehicle_type || q.vehicle_type,
          make_model: v.vehicle_name || null,
          owner_email: email,
          policy_number,
          fleet_owner_id: owner?.id ?? null,
          legal_status: 'clear',
          is_active: true,
          created_by: email,
        },
      });
      await tx.fleetDriver.create({
        data: {
          name: v.driver_name,
          phone: v.driver_phone || meta.buyer.phone,
          email,
          fleet_owner_id: owner?.id ?? null,
          owner_email: email,
          policy_number,
          assigned_vehicle_id: vehicle.id,
          assigned_vehicle_number: vehicle.vehicle_number,
          status: 'active',
          created_by: email,
        },
      });
    }

    const subscription = await tx.rGLSubscription.create({
      data: {
        policy_number,
        buyer_name: meta.buyer.name,
        buyer_email: email,
        buyer_phone: meta.buyer.phone,
        city: meta.buyer.city,
        fleet_size: q.fleet_size,
        vehicle_type: q.vehicle_type,
        plan_name: q.plan_name,
        plan_type: 'intercity',
        amount_paid: order.amount,
        discount_amount: q.period_discount + q.promo_discount,
        referral_code_used: meta.referral_code,
        referrer_email: meta.referrer_email,
        txn_id: order.cf_payment_id || order.id,
        payment_date: isoDate(today),
        activation_date,
        expiry_date,
        auto_renewal: false,
        status: 'active',
        notes: `Order ${order.id} · ${q.billing_period} · ₹${q.monthly_rate}/vehicle/month${q.promo_code ? ` · Promo ${q.promo_code}` : ''}${meta.pending_cases_details ? ` · Pending: ${meta.pending_cases_details}` : ''}`,
        created_by: email,
      },
    });
    // Prices are GST-inclusive: the invoice total is exactly what was paid
    const gst_amount = money(order.amount - order.amount / (1 + GST_RATE));
    const invoice = await tx.fleetInvoice.create({
      data: {
        invoice_number: await this.newInvoiceNumber(tx),
        policy_number,
        fleet_owner_id: owner?.id ?? null,
        owner_name: meta.buyer.name,
        owner_email: email,
        owner_phone: meta.buyer.phone,
        plan: `${q.plan_name} (${q.billing_period})`,
        vehicle_count: q.fleet_size,
        amount: money(order.amount - gst_amount),
        gst_amount,
        total_amount: order.amount,
        transaction_id: order.cf_payment_id || order.id,
        payment_method: order.payment_method || 'Online',
        payment_date: isoDate(today),
        subscription_start: activation_date,
        subscription_end: expiry_date,
        status: 'paid',
        email_sent: true,
        notes: JSON.stringify(meta.vehicles),
        created_by: email,
      },
    });
    if (owner) {
      await tx.fleetOwner.update({
        where: { id: owner.id },
        data: { subscription_start: activation_date, subscription_end: expiry_date, status: 'active', last_invoice_id: invoice.id },
      });
    }
    if (q.promo_code) {
      await tx.promoCode.updateMany({ where: { code: { equals: q.promo_code, mode: 'insensitive' } }, data: { used_count: { increment: 1 } } });
    }
    if (meta.referral_code) {
      await tx.rGLReferral.updateMany({ where: { referral_code: meta.referral_code }, data: { total_referrals: { increment: 1 } } });
    }

    after.push(async () => {
      const data = {
        name: meta.buyer.name,
        email,
        phone: meta.buyer.phone,
        policyNumber: policy_number,
        planName: q.plan_name,
        fleetSize: q.fleet_size,
        vehicleType: q.vehicle_type,
        months: q.months,
        amount: order.amount,
        activationDate: activation_date,
        expiryDate: expiry_date,
        invoiceNumber: invoice.invoice_number,
        taxableAmount: invoice.amount,
        gstAmount: gst_amount,
        vehicles: meta.vehicles.map((v, i) => `${i + 1}. ${v.driver_name} | ${v.vehicle_reg}`),
      };
      await this.mail.sendTemplate('rgl_subscription_confirmed', email, data);
      await this.mail.sendAdminCopy('rgl_subscription_confirmed', email, data);
    });
    return { subscription_id: subscription.id, policy_number, activation_date, expiry_date, invoice_number: invoice.invoice_number, invoice_id: invoice.id };
  }

  private async newInvoiceNumber(tx: Tx): Promise<string> {
    for (;;) {
      const candidate = `INV-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
      if (!(await tx.fleetInvoice.findFirst({ where: { invoice_number: candidate }, select: { id: true } }))) return candidate;
    }
  }

  private async newPolicyNumber(tx: Tx): Promise<string> {
    for (;;) {
      const candidate = `RGL-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
      if (!(await tx.rGLSubscription.findFirst({ where: { policy_number: candidate }, select: { id: true } }))) return candidate;
    }
  }

  private view(order: PaymentOrder) {
    const meta = (order.meta ?? {}) as Record<string, unknown>;
    return {
      order_id: order.id,
      purpose: order.purpose,
      amount: order.amount,
      status: order.status,
      paid: order.status === 'paid' || order.status === 'fulfilled',
      fulfilled: order.status === 'fulfilled',
      result: meta.result ?? null,
    };
  }
}

/** Cashfree wants a 10-digit phone; it's only used for payment notifications. */
function normalizePhone(phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? digits : '9999999999';
}
