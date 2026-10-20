import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Logger, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AiService } from '../ai/ai.service.js';
import { Public } from '../common/decorators.js';
import type { Env } from '../config/env.js';
import { TwilioClient } from './twilio.client.js';

const INTENTS = ['greeting', 'legal_service', 'challan_check', 'talk_to_lawyer', 'case_status', 'about', 'unknown'] as const;
type Intent = (typeof INTENTS)[number];

/** Twilio's incoming-message webhook for the WhatsApp bot. */
@Controller('webhooks/whatsapp')
@Public()
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly twilio: TwilioClient,
    private readonly ai: AiService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  status() {
    return { status: 'MyAdhikaar WhatsApp Bot is running', configured: this.twilio.configured };
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async incoming(@Body() body: Record<string, string>, @Headers('x-twilio-signature') signature: string | undefined, @Res() res: Response) {
    // Twilio signs the exact URL configured in its console
    const url = `${this.config.get('API_URL', { infer: true }) ?? ''}/api/webhooks/whatsapp`;
    if (!this.twilio.validSignature(signature, url, body ?? {})) throw new ForbiddenException('Invalid signature');

    const from = body.From;
    const message = body.Body?.trim();
    if (from && message) {
      const reply = await this.replyTo(message.slice(0, 2000)).catch((err: Error) => {
        this.logger.error(`WhatsApp intent failed: ${err.message}`);
        return this.buildReply({ intent: 'unknown', reply: 'Namaste! 🙏' });
      });
      await this.twilio.sendWhatsApp(from, reply).catch((err: Error) => this.logger.error(`WhatsApp reply failed: ${err.message}`));
    }
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  private async replyTo(message: string): Promise<string> {
    const result = (await this.ai.invoke(
      {
        prompt: `You are a legal assistant for MyAdhikaar, an Indian legal services platform. Classify the WhatsApp message below and write a short reply.

Rules:
- "challan", "traffic fine", "e-challan" → challan_check
- "lawyer", "advocate", "vakeel", "consultation", "baat" → talk_to_lawyer
- "trademark", "company", "GST", "registration", "legal notice", "divorce", "property" → legal_service
- "case", "my case", "status" → case_status
- "hi", "hello", "namaste" → greeting
- Questions about MyAdhikaar itself → about
The reply guides the user to the right service in their language (Hindi or English), is warm and professional, and stays under 120 words.

<message>
${message}
</message>`,
        response_json_schema: {
          type: 'object',
          properties: { intent: { type: 'string', enum: [...INTENTS] }, reply: { type: 'string' } },
          required: ['intent', 'reply'],
        },
      },
      'low',
    )) as { intent: Intent; reply: string };
    return this.buildReply(result);
  }

  private buildReply({ intent, reply }: { intent: Intent; reply: string }): string {
    const app = this.config.get('APP_URL', { infer: true });
    const menu = '1️⃣ ⚖️ Legal Services\n2️⃣ 🚦 Traffic Challan\n3️⃣ 👨‍⚖️ Talk to Lawyer\n4️⃣ 📁 Case Status';
    const replies: Record<Intent, string> = {
      greeting: `${reply}\n\n🏛️ *MyAdhikaar Legal Services*\n\nHow can I help you today?\n\n${menu}\n\nReply with a number or describe your issue.`,
      legal_service: `${reply}\n\n📋 *Legal Services:*\n• Trademark Registration\n• Company/LLP Registration\n• GST Registration\n• Legal Notices\n• Property Disputes\n• Consumer Cases\n\n🔗 Browse & Book: ${app}/LegalServices`,
      challan_check: `${reply}\n\n🚦 *Check Your Traffic Challan* by vehicle number, see settlement options and get help disputing it.\n\n🔗 Check Now: ${app}/ChallanCheck`,
      talk_to_lawyer: `${reply}\n\n👨‍⚖️ *Talk to a Verified Advocate*\n✅ Bar Council verified\n✅ Audio, video & chat\n\n🔗 Find a Lawyer: ${app}/TalkToLawyer`,
      case_status: `${reply}\n\n📁 Log in to see your case status:\n🔗 ${app}/MyCases`,
      about: `🏛️ *About MyAdhikaar*\n\nIndia's trusted legal services platform:\n⚖️ Legal Services\n🚦 Challan Check & Settlement\n👨‍⚖️ Verified Advocates\n📁 Case Management\n\n🔗 ${app}\n📞 Support: +91 8307749147`,
      unknown: `${reply}\n\n🏛️ *MyAdhikaar can help you with:*\n\n${menu}\n\nReply with a number or describe your legal need!`,
    };
    return replies[intent] ?? replies.unknown;
  }
}
