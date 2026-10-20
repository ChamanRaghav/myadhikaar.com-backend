import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { AuthUser } from '../common/auth-user.js';
import { runExclusive } from '../common/cron-lock.js';
import type { Env } from '../config/env.js';
import { PolicyContext } from '../entities/policy-context.js';
import type { Lawyer, Prisma, Session } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { money, WalletService } from '../wallet/wallet.service.js';

type Tx = Prisma.TransactionClient;

export interface StartSessionInput {
  lawyer_id: string;
  session_type: 'call' | 'chat';
  consultation_id?: string | null;
  lawyer_name?: string;
  user_name?: string;
  notes?: string;
}

export interface BookAppointmentInput {
  lawyer_id: string;
  lawyer_name?: string;
  client_name?: string;
  mode?: string;
  scheduled_date: string;
  notes?: string;
}

/** Per-minute rate from the lawyer's per-30-minute price (as in Base44). */
export function ratePerMinute(lawyer: Pick<Lawyer, 'consultation_rate' | 'chat_rate'>, type: 'call' | 'chat'): number {
  const per30 = type === 'chat' ? lawyer.chat_rate || lawyer.consultation_rate || 300 : lawyer.consultation_rate || 300;
  return Math.round(per30 / 30);
}

const MIN_BALANCE_MINUTES = 5;
const PREBOOK_MINUTES = 15;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async start(user: AuthUser, input: StartSessionInput) {
    if (!input.lawyer_id || !['call', 'chat'].includes(input.session_type)) {
      throw new BadRequestException('lawyer_id and session_type (call or chat) are required');
    }
    const lawyer = await this.prisma.lawyer.findUnique({ where: { id: input.lawyer_id } });
    if (!lawyer) throw new NotFoundException('Lawyer not found');
    const rate = ratePerMinute(lawyer, input.session_type);
    const idempotencyKey = `${user.email}-${lawyer.id}-${input.consultation_id || 'instant'}`;

    const { session, balance, reused } = await this.prisma.$transaction(async (tx) => {
      const { wallet } = await this.wallet.lock(tx, user.email);
      const balance = wallet.balance ?? 0;
      if (balance < rate * MIN_BALANCE_MINUTES) {
        throw new HttpException(
          { message: `Insufficient balance. Minimum ₹${rate * MIN_BALANCE_MINUTES} required.`, balance },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      // One active session per user: reuse the same one on retries, expire any other
      const active = await tx.session.findMany({ where: { user_email: user.email, status: 'active' } });
      const same = active.find((s) => s.idempotency_key === idempotencyKey);
      if (same) return { session: same, balance, reused: true };
      const now = new Date().toISOString();
      if (active.length) {
        await tx.session.updateMany({ where: { id: { in: active.map((s) => s.id) } }, data: { status: 'expired', ended_at: now } });
      }
      const session = await tx.session.create({
        data: {
          user_email: user.email,
          lawyer_id: lawyer.id,
          lawyer_name: lawyer.full_name || input.lawyer_name,
          consultation_id: input.consultation_id || null,
          session_type: input.session_type,
          rate_per_min: rate,
          idempotency_key: idempotencyKey,
          status: 'active',
          started_at: now,
          last_tick_at: now,
          duration_minutes: 0,
          total_charged: 0,
          created_by: user.email,
        },
      });
      return { session, balance, reused: false };
    });

    if (!reused && lawyer.email) {
      this.mail.background(
        this.mail.sendTemplate('advocate_incoming_call', lawyer.email, {
          advocateName: lawyer.full_name || input.lawyer_name,
          clientName: input.user_name || user.full_name || user.email,
          callType: input.session_type === 'call' ? 'Audio/Video Call' : 'Chat',
          notes: input.notes || '',
        }),
        'incoming call email',
      );
    }
    return { session, balance };
  }

  async end(user: AuthUser, sessionId: string) {
    if (!sessionId) throw new BadRequestException('session_id required');
    const existing = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!existing || !(await this.canAccess(user, existing))) throw new NotFoundException('Session not found');

    let finalCharge = 0;
    const ended = await this.prisma.$transaction(async (tx) => {
      const s = await this.lockSession(tx, sessionId);
      if (s.status !== 'active') return null;
      const now = new Date();
      const billedMinutes = s.duration_minutes ?? 0;
      const unbilled = (now.getTime() - new Date(s.started_at!).getTime()) / 60_000 - billedMinutes;
      let finalMinutes = 0;
      // Charge the final part-minute, if more than 20 seconds
      if (unbilled > 0.33 && (s.rate_per_min ?? 0) > 0) {
        const { wallet } = await this.wallet.lock(tx, s.user_email!);
        const { charged } = await this.wallet.debitUpTo(tx, wallet, (s.rate_per_min ?? 0) * unbilled, {
          type: 'deduction',
          description: `${s.session_type === 'call' ? '📞 Call' : '💬 Chat'} with ${s.lawyer_name} - final ${unbilled.toFixed(1)} min`,
          lawyer_name: s.lawyer_name ?? undefined,
          consultation_id: s.consultation_id ?? undefined,
          duration_minutes: money(unbilled),
          rate_per_min: s.rate_per_min ?? undefined,
        });
        finalCharge = charged;
        finalMinutes = charged > 0 ? money(unbilled) : 0;
        await this.creditLawyer(tx, s.lawyer_id, charged);
      }
      const total_duration = money(billedMinutes + finalMinutes);
      const total_charged = money((s.total_charged ?? 0) + finalCharge);
      const updated = await tx.session.update({
        where: { id: s.id },
        data: { status: 'ended', ended_at: now.toISOString(), duration_minutes: total_duration, total_charged },
      });
      if (s.consultation_id) {
        await tx.consultation.updateMany({
          where: { id: s.consultation_id },
          data: { status: 'completed', duration_minutes: total_duration, amount_paid: total_charged },
        });
      }
      return updated;
    });

    if (!ended) return { session: existing, alreadyEnded: true };
    this.mail.background(this.sendCallSummary(user, ended), 'call summary emails');
    return { success: true, duration_minutes: ended.duration_minutes, total_charged: ended.total_charged };
  }

  async status(user: AuthUser, sessionId?: string) {
    let session: Session | null;
    if (sessionId) {
      session = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (session && !(await this.canAccess(user, session))) session = null;
    } else {
      session = await this.prisma.session.findFirst({ where: { user_email: user.email, status: 'active' } });
    }
    const wallet = await this.prisma.wallet.findFirst({ where: { user_email: user.email }, orderBy: { created_date: 'asc' } });
    return { session, balance: wallet?.balance ?? 0 };
  }

  /** Charges a 15-minute pre-booking and creates the consultation. */
  async book(user: AuthUser, input: BookAppointmentInput) {
    const scheduled = new Date(input.scheduled_date);
    if (!input.lawyer_id || Number.isNaN(scheduled.getTime())) throw new BadRequestException('Missing required fields');
    const lawyer = await this.prisma.lawyer.findUnique({ where: { id: input.lawyer_id } });
    if (!lawyer) throw new NotFoundException('Lawyer not found');
    const rate = ratePerMinute(lawyer, 'call');
    const prebook = rate * PREBOOK_MINUTES;
    const lawyerName = lawyer.full_name || input.lawyer_name || 'Advocate';

    return this.prisma.$transaction(async (tx) => {
      const { wallet } = await this.wallet.lock(tx, user.email);
      if ((wallet.balance ?? 0) < prebook) {
        throw new HttpException({ message: `Insufficient balance. ₹${prebook} required.`, required: prebook }, HttpStatus.PAYMENT_REQUIRED);
      }
      const { wallet: after } = await this.wallet.debitUpTo(tx, wallet, prebook, {
        type: 'deduction',
        description: `Appointment pre-booking with ${lawyerName}`,
        lawyer_name: lawyerName,
        duration_minutes: PREBOOK_MINUTES,
        rate_per_min: rate,
      });
      const consultation = await tx.consultation.create({
        data: {
          client_email: user.email,
          client_name: input.client_name || user.full_name,
          lawyer_id: lawyer.id,
          lawyer_name: lawyerName,
          status: 'scheduled',
          consultation_type: input.mode === 'video' ? 'video' : 'audio',
          amount_paid: prebook,
          duration_minutes: PREBOOK_MINUTES,
          scheduled_date: scheduled.toISOString(),
          notes: input.notes,
          created_by: user.email,
        },
      });
      return { consultation, prebook_amount: prebook, balance: after.balance };
    });
  }

  /** Bills every active session for the whole minutes since its last tick. */
  @Cron('* * * * *')
  async tick(): Promise<void> {
    if (!this.config.get('CRON_ENABLED', { infer: true })) return;
    await runExclusive(this.prisma, 'sessions-tick', () => this.billActiveSessions());
  }

  async billActiveSessions(now = new Date()): Promise<void> {
    const active = await this.prisma.session.findMany({ where: { status: 'active' }, select: { id: true } });
    for (const { id } of active) {
      await this.billSession(id, now).catch((err: Error) => this.logger.error(`Billing session ${id} failed: ${err.message}`));
    }
  }

  private async billSession(id: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.lockSession(tx, id);
      if (s.status !== 'active') return;
      const minutesElapsed = (now.getTime() - new Date(s.last_tick_at || s.started_at!).getTime()) / 60_000;
      if (minutesElapsed < 0.9) return;
      const minutes = Math.floor(minutesElapsed);
      const rate = s.rate_per_min ?? 0;

      if (rate <= 0) {
        await tx.session.update({
          where: { id },
          data: { last_tick_at: now.toISOString(), duration_minutes: (s.duration_minutes ?? 0) + minutes },
        });
        return;
      }

      const { wallet } = await this.wallet.lock(tx, s.user_email!);
      if ((wallet.balance ?? 0) < rate) {
        await tx.session.update({ where: { id }, data: { status: 'expired', ended_at: now.toISOString() } });
        await tx.walletTransaction.create({
          data: {
            user_email: s.user_email,
            type: 'deduction',
            amount: 0,
            description: `Session ended - insufficient balance (${s.session_type} with ${s.lawyer_name})`,
            lawyer_name: s.lawyer_name,
            consultation_id: s.consultation_id,
            status: 'completed',
          },
        });
        return;
      }

      // Whole minutes only: charge what the balance covers
      const affordable = Math.min(minutes, Math.floor((wallet.balance ?? 0) / rate));
      const { charged } = await this.wallet.debitUpTo(tx, wallet, rate * affordable, {
        type: 'deduction',
        description: `${s.session_type === 'call' ? '📞 Call' : '💬 Chat'} with ${s.lawyer_name} - ${affordable} min`,
        lawyer_name: s.lawyer_name ?? undefined,
        consultation_id: s.consultation_id ?? undefined,
        duration_minutes: affordable,
        rate_per_min: rate,
      });
      await tx.session.update({
        where: { id },
        data: {
          last_tick_at: now.toISOString(),
          duration_minutes: (s.duration_minutes ?? 0) + affordable,
          total_charged: money((s.total_charged ?? 0) + charged),
        },
      });
      await this.creditLawyer(tx, s.lawyer_id, charged);
    });
  }

  /** The lawyer earns what the client paid (as in Base44). */
  private async creditLawyer(tx: Tx, lawyerId: string | null, amount: number): Promise<void> {
    if (!lawyerId || amount <= 0) return;
    const lawyer = await tx.lawyer.findUnique({ where: { id: lawyerId }, select: { email: true } });
    if (!lawyer?.email) return;
    const { wallet } = await this.wallet.lock(tx, lawyer.email);
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: money(amount) }, total_recharged: { increment: money(amount) } },
    });
  }

  private async lockSession(tx: Tx, id: string): Promise<Session> {
    const [s] = await tx.$queryRaw<Session[]>`SELECT * FROM "sessions" WHERE "id" = ${id} FOR UPDATE`;
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  /** The client, or the lawyer on the call. */
  private async canAccess(user: AuthUser, session: Session): Promise<boolean> {
    if (session.user_email === user.email || user.role === 'admin') return true;
    return (await new PolicyContext(user, this.prisma).lawyerIds()).includes(session.lawyer_id ?? '');
  }

  private async sendCallSummary(user: AuthUser, s: Session): Promise<void> {
    if (!s.duration_minutes) return;
    const callType = s.session_type === 'call' ? 'Audio/Video Call' : 'Chat';
    const client = await this.prisma.user.findUnique({ where: { email: s.user_email! } });
    const clientName = client?.full_name || s.user_email;
    await this.mail.sendTemplate('call_completed_user', s.user_email!, {
      userName: clientName,
      lawyerName: s.lawyer_name,
      callType,
      duration: s.duration_minutes,
      amountCharged: s.total_charged,
    });
    const lawyer = s.lawyer_id ? await this.prisma.lawyer.findUnique({ where: { id: s.lawyer_id } }) : null;
    if (!lawyer?.email) return;
    const endedBefore = await this.prisma.session.count({ where: { lawyer_id: lawyer.id, status: 'ended' } });
    if (endedBefore <= 1 && (s.total_charged ?? 0) > 0) {
      await this.mail.sendTemplate('advocate_first_earning', lawyer.email, { advocateName: lawyer.full_name, amount: s.total_charged });
    } else {
      await this.mail.sendTemplate('call_completed_advocate', lawyer.email, {
        advocateName: lawyer.full_name,
        clientName,
        callType,
        duration: s.duration_minutes,
        amountEarned: s.total_charged,
      });
    }
  }
}
