import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';

@Injectable()
export class TwilioClient {
  private readonly logger = new Logger(TwilioClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get configured(): boolean {
    return !!(this.config.get('TWILIO_ACCOUNT_SID', { infer: true }) && this.config.get('TWILIO_AUTH_TOKEN', { infer: true }) && this.config.get('TWILIO_WHATSAPP_NUMBER', { infer: true }));
  }

  /** Sends a WhatsApp message; Indian numbers may be given without +91. */
  async sendWhatsApp(phone: string, body: string): Promise<void> {
    if (!this.configured) {
      this.logger.log(`WhatsApp not configured; skipped message to ${phone}`);
      return;
    }
    const sid = this.config.get('TWILIO_ACCOUNT_SID', { infer: true })!;
    const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${toIndianE164(phone)}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${this.config.get('TWILIO_AUTH_TOKEN', { infer: true })}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: this.config.get('TWILIO_WHATSAPP_NUMBER', { infer: true })!, To: to, Body: body.slice(0, 1600) }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  /** X-Twilio-Signature: base64 HMAC-SHA1 of the URL followed by the sorted POST params. */
  validSignature(signature: string | undefined, url: string, params: Record<string, string>): boolean {
    const token = this.config.get('TWILIO_AUTH_TOKEN', { infer: true });
    if (!token || !signature) return false;
    const signed = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
    const expected = createHmac('sha1', token).update(signed).digest();
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}

export function toIndianE164(phone: string): string {
  if (phone.trim().startsWith('+')) return '+' + phone.replace(/\D/g, '');
  return '+91' + phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
}
