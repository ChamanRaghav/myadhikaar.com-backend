import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { runExclusive } from '../common/cron-lock.js';
import type { Env } from '../config/env.js';
import { EntityEvents } from '../entities/entity-events.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TwilioClient } from './twilio.client.js';

const IST_OFFSET_MS = 330 * 60_000;

/** Ported Base44 automations: on-create notifications and the scheduled admin/advocate reports. */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly twilio: TwilioClient,
    private readonly events: EntityEvents,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.events.onCreate('Consultation', (c) => this.consultationBooked(c));
    this.events.onCreate('ServiceRequest', (sr) => this.serviceRequested(sr));
  }

  async consultationBooked(c: Record<string, any>): Promise<void> {
    if (!c.client_email) return;
    const user = await this.prisma.user.findUnique({ where: { email: c.client_email }, select: { phone: true } });
    if (!user?.phone) return;
    const type: string = c.consultation_type || 'call';
    const when = c.scheduled_date
      ? new Date(c.scheduled_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : '';
    const message = [
      '✅ *Consultation Confirmed!*',
      '',
      `Hello ${c.client_name || 'there'},`,
      `Your ${type} consultation has been successfully booked on *MyAdhikaar*.`,
      '',
      `${type === 'video' ? '📹' : '📞'} *Type:* ${type.charAt(0).toUpperCase() + type.slice(1)} Call`,
      `👨‍⚖️ *Advocate:* ${c.lawyer_name || 'your advocate'}`,
      when ? `🗓️ *Scheduled:* ${when} IST` : '',
      c.amount_paid ? `💰 *Amount Paid:* ₹${c.amount_paid}` : '',
      '',
      '📌 *What to do next:*',
      '• Keep your phone handy at the scheduled time',
      '• Have any relevant documents ready',
      '• Join via the MyAdhikaar app',
      '',
      'Need help? Call us at +91 8307749147 or reply here.',
      '',
      '— Team MyAdhikaar 🏛️',
    ].join('\n');
    await this.twilio.sendWhatsApp(user.phone, message);
  }

  async serviceRequested(sr: Record<string, any>): Promise<void> {
    const service = sr.service_title || 'Legal Service';
    const userName = sr.client_name || 'Valued Client';
    await Promise.all([
      this.mail.sendTemplate('admin_service_request', this.mail.adminInboxes, {
        userName,
        email: sr.client_email,
        service,
        description: [sr.category && `Category: ${sr.category}`, sr.client_phone && `Phone: ${sr.client_phone}`, sr.description].filter(Boolean).join('\n'),
      }),
      sr.client_email ? this.mail.sendTemplate('user_service_request', sr.client_email, { userName, service }) : undefined,
    ]);
  }

  /** 08:00 IST: yesterday's calls, revenue and sign-ups. */
  @Cron('30 2 * * *', { timeZone: 'UTC' })
  async dailyReport(): Promise<void> {
    if (!this.config.get('CRON_ENABLED', { infer: true })) return;
    await runExclusive(this.prisma, 'daily-admin-report', async () => {
      await this.sendDailyReport();
    });
  }

  async sendDailyReport(now = new Date()): Promise<Record<string, unknown>> {
    const end = istMidnight(now);
    const start = new Date(end.getTime() - 24 * 3600_000);
    const range = { gte: start, lt: end };
    // Session times are stored as ISO strings, which sort chronologically
    const [sessions, newUsers, newAdvocateApps, openDisputes] = await Promise.all([
      this.prisma.session.findMany({ where: { status: 'ended', ended_at: { gte: start.toISOString(), lt: end.toISOString() } }, select: { total_charged: true } }),
      this.prisma.user.count({ where: { created_date: range } }),
      this.prisma.lawyerApplication.count({ where: { created_date: range } }),
      this.prisma.dispute.count({ where: { status: 'open' } }),
    ]);
    const data = {
      date: new Date(start.getTime() + IST_OFFSET_MS).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
      totalCalls: sessions.length,
      totalRevenue: sessions.reduce((sum, s) => sum + (s.total_charged ?? 0), 0).toFixed(0),
      newUsers,
      newAdvocateApps,
      openDisputes,
    };
    await this.mail.sendTemplate('admin_daily_report', this.mail.adminInboxes, data);
    return data;
  }

  /** 07:30 IST on the 1st: each advocate's previous month. */
  @Cron('0 2 1 * *', { timeZone: 'UTC' })
  async monthlyAdvocateSummary(): Promise<void> {
    if (!this.config.get('CRON_ENABLED', { infer: true })) return;
    await runExclusive(this.prisma, 'monthly-advocate-summary', async () => {
      await this.sendMonthlySummaries();
    });
  }

  async sendMonthlySummaries(now = new Date()): Promise<number> {
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
    const start = monthStart(ist.getUTCFullYear(), ist.getUTCMonth() - 1);
    const end = monthStart(ist.getUTCFullYear(), ist.getUTCMonth());
    const month = new Date(start.getTime() + IST_OFFSET_MS).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const totals = await this.prisma.session.groupBy({
      by: ['lawyer_id'],
      where: { status: 'ended', ended_at: { gte: start.toISOString(), lt: end.toISOString() }, lawyer_id: { not: null } },
      _count: { _all: true },
      _sum: { duration_minutes: true, total_charged: true },
    });
    const lawyers = await this.prisma.lawyer.findMany({ where: { id: { in: totals.map((t) => t.lawyer_id!) }, status: 'active' } });
    let sent = 0;
    for (const lawyer of lawyers) {
      const t = totals.find((x) => x.lawyer_id === lawyer.id)!;
      if (!lawyer.email) continue;
      await this.mail
        .sendTemplate('advocate_monthly_summary', lawyer.email, {
          advocateName: lawyer.full_name,
          month,
          totalCalls: t._count._all,
          totalMinutes: t._sum.duration_minutes ?? 0,
          totalEarned: (t._sum.total_charged ?? 0).toFixed(0),
          avgRating: lawyer.rating || null,
        })
        .then(() => sent++)
        .catch((err: Error) => this.logger.warn(`Monthly summary for ${lawyer.id}: ${err.message}`));
    }
    return sent;
  }
}

/** The most recent midnight in India, as a UTC instant. */
function istMidnight(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}
