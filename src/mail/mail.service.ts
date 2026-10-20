import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { escapeDeep, escapeHtml } from '../common/html.js';
import { templates, wrapHtml } from './templates.js';

export interface OutgoingEmail {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Emails captured instead of sent when RESEND_API_KEY is unset (development and tests). */
  readonly outbox: OutgoingEmail[] = [];

  constructor(private readonly config: ConfigService<Env, true>) {}

  get adminInboxes(): string[] {
    return this.config.get('ADMIN_EMAILS', { infer: true });
  }

  async send(email: OutgoingEmail): Promise<void> {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    if (!apiKey) {
      this.outbox.push(email);
      this.logger.log(`Email not sent (RESEND_API_KEY unset): "${email.subject}" → ${[email.to].flat().join(', ')}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.config.get('EMAIL_FROM', { infer: true }), ...email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message || `Resend error ${res.status}`);
    }
  }

  hasTemplate(name: string): boolean {
    return Object.hasOwn(templates, name);
  }

  /** Data comes from users, so it is HTML-escaped for the body; the subject is plain text. */
  render(template: string, data: Record<string, unknown> = {}): { subject: string; html: string } {
    const fn = templates[template];
    if (!fn) throw new Error(`Unknown template: ${template}`);
    return { subject: fn(data).subject, html: wrapHtml(fn(escapeDeep(data)).body) };
  }

  async sendTemplate(template: string, to: string | string[], data: Record<string, unknown> = {}): Promise<void> {
    await this.send({ to, ...this.render(template, data) });
  }

  /** Sends the admin_ variant of a template, or a field summary when there is none. */
  async sendAdminCopy(template: string, recipient: string, data: Record<string, unknown>, adminTo?: string): Promise<void> {
    const inboxes = this.adminInboxes;
    const target = adminTo && inboxes.includes(adminTo.toLowerCase()) ? adminTo : inboxes;
    if (!target.length) return;
    const adminTemplate = `admin_${template.replace(/^user_|^advocate_/, '')}`;
    if (this.hasTemplate(adminTemplate)) {
      await this.sendTemplate(adminTemplate, target, data);
      return;
    }
    const rows = Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('\n');
    await this.send({
      to: target,
      subject: `[Admin Alert] ${this.render(template, data).subject}`,
      html: wrapHtml(`<h3>[Admin Copy] ${escapeHtml(template)}</h3><p>Sent to: <b>${escapeHtml(recipient)}</b></p><table>${rows}</table>`),
    });
  }

  /** `html` must already be safe; escape any user data that goes into it. */
  async notifyAdmins(subject: string, html: string): Promise<void> {
    if (!this.adminInboxes.length) return;
    await this.send({ to: this.adminInboxes, subject, html: wrapHtml(html) });
  }

  /** Fire-and-forget helper for notifications that must not fail the request. */
  background(promise: Promise<unknown>, what: string): void {
    promise.catch((err: Error) => this.logger.warn(`${what} failed: ${err.message}`));
  }
}
