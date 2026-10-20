import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { isAdmin, type AuthUser } from '../common/auth-user.js';
import { MailService } from '../mail/mail.service.js';
import type { CreatePaymentDto } from '../payments/dto.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { CommunityService } from './community.service.js';
import { DailyService } from './daily.service.js';
import { TtsService } from './tts.service.js';

type Body = Record<string, any>;

/** Emails the server now sends itself; client copies would be duplicates. */
const SERVER_SENT = new Set(['service_payment_success', 'wallet_recharge', 'user_service_request', 'admin_service_request']);
/** Receipts public forms send to the person who filled them in. */
const PUBLIC_RECEIPTS = new Set(['career_application_received', 'advocate_application_received', 'roadguard_enquiry_user']);
const REMOVED = new Set(['payuInitiate', 'generateDummyAdvocates', 'oauthCallback']);

/** Base44's functions.invoke(name, body), mapped onto the new services. */
@Injectable()
export class FunctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly payments: PaymentsService,
    private readonly mail: MailService,
    private readonly daily: DailyService,
    private readonly tts: TtsService,
    private readonly community: CommunityService,
  ) {}

  async invoke(name: string, body: Body, user: AuthUser | undefined): Promise<unknown> {
    const me = () => {
      if (!user) throw new UnauthorizedException('Login required');
      return user;
    };
    switch (name) {
      case 'startSession':
        return this.sessions.start(me(), body as never);
      case 'endSession':
        return this.sessions.end(me(), body.session_id);
      case 'getSessionStatus':
        return this.sessions.status(me(), body.session_id);
      case 'bookAppointment':
        return this.sessions.book(me(), body as never);
      case 'cashfreeInitiate':
        return this.legacyInitiate(me(), body);
      case 'verifyCashfreePayment':
        return this.legacyVerify(me(), body.orderId);
      case 'walletRechargeCallback':
        return this.legacyWalletCallback(me(), body.order_id);
      case 'generateFleetInvoice':
        return this.latestInvoice(me());
      case 'createDailyRoom':
        return this.daily.createRoom(me(), body);
      case 'textToSpeech':
        return this.tts.speak(body.text);
      case 'sendEmail':
        return this.sendEmail(user, body);
      case 'submitLawyerReview':
        return this.community.submitLawyerReview(me(), body);
      case 'requestReferralWithdrawal':
        return this.community.requestReferralWithdrawal(me(), body);
      default:
        if (REMOVED.has(name)) throw new GoneException(`${name} is no longer available`);
        throw new NotFoundException(`Unknown function ${name}`);
    }
  }

  /** Old checkout: wallet orders (WLT…) and service orders whose request carries the order id. */
  private async legacyInitiate(user: AuthUser, body: Body) {
    const orderId = String(body.orderId ?? '');
    let dto: CreatePaymentDto;
    if (orderId.startsWith('WLT')) {
      const coupon = /\(Coupon: ([A-Z0-9]+)\)/.exec(String(body.orderNote ?? ''))?.[1];
      dto = { purpose: 'wallet_recharge', wallet: coupon ? { coupon } : { amount: Number(body.amount) }, phone: body.customerPhone };
    } else {
      const sr = orderId ? await this.prisma.serviceRequest.findFirst({ where: { payment_order_id: orderId, client_email: user.email } }) : null;
      if (!sr) throw new BadRequestException('Please refresh the page to use the updated checkout');
      dto = { purpose: 'service', service: { service_request_id: sr.id }, phone: body.customerPhone };
    }
    const order = await this.payments.create(user, dto);
    return { payment_session_id: order.payment_session_id, order_id: order.order_id, is_sandbox: order.environment === 'sandbox' };
  }

  private async legacyVerify(user: AuthUser, orderId: string) {
    const v = await this.payments.verify(user, orderId);
    const status = v.paid ? 'PAID' : v.status === 'failed' ? 'EXPIRED' : 'ACTIVE';
    return {
      success: v.paid,
      failed: v.status === 'failed',
      status,
      order: { order_id: v.order_id, order_amount: v.amount, order_status: status, customer_name: user.full_name, customer_email: user.email },
      payment: null,
    };
  }

  private async legacyWalletCallback(user: AuthUser, orderId: string) {
    const v = await this.payments.verify(user, orderId);
    const result = (v.result ?? {}) as { new_balance?: number; bonus?: number };
    return v.fulfilled
      ? { success: true, new_balance: result.new_balance, bonus_credited: result.bonus ?? 0 }
      : { success: false, status: v.status, message: 'Payment not confirmed' };
  }

  /** Invoices are created when a RoadGuard payment is fulfilled; return the latest one. */
  private async latestInvoice(user: AuthUser) {
    const invoice = await this.prisma.fleetInvoice.findFirst({ where: { owner_email: user.email }, orderBy: { created_date: 'desc' } });
    if (!invoice) return { success: false, message: 'No invoice yet — it appears once the payment is confirmed' };
    return {
      success: true,
      invoice_number: invoice.invoice_number,
      invoice_id: invoice.id,
      total_amount: invoice.total_amount,
      subscription_end: invoice.subscription_end,
    };
  }

  /** Templates only (escaped), to the caller, our inboxes, or public-form receipts; admins anywhere. */
  private async sendEmail(user: AuthUser | undefined, body: Body) {
    const { template, data = {}, adminCopy, adminTo } = body;
    const recipients: string[] = [body.to].flat().filter(Boolean).map((r: string) => String(r).trim().toLowerCase());
    if (!recipients.length || !template) throw new BadRequestException('template and to are required');
    const internal = (r: string) => this.mail.adminInboxes.includes(r);

    if (template === 'raw_html') {
      if (!recipients.every(internal) || !body.html || !body.subject) throw new ForbiddenException('raw_html is only for admin notifications');
      await this.mail.send({ to: recipients, subject: String(body.subject).slice(0, 200), html: String(body.html) });
      return { success: true };
    }
    if (!this.mail.hasTemplate(template)) throw new BadRequestException(`Unknown template: ${template}`);
    if (SERVER_SENT.has(template)) return { success: true, skipped: 'sent by the server' };
    const allowed =
      isAdmin(user) || recipients.every((r) => internal(r) || r === user?.email || PUBLIC_RECEIPTS.has(template));
    if (!allowed) throw new ForbiddenException('You can only email yourself or MyAdhikaar support');

    await this.mail.sendTemplate(template, recipients, data);
    if (adminCopy) await this.mail.sendAdminCopy(template, recipients[0], data, adminTo);
    return { success: true, template };
  }
}
