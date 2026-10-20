import {
  BadRequestException, Body, Controller, ForbiddenException, HttpCode, Post, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AiService, type InvokeOptions } from '../ai/ai.service.js';
import { isAdmin, type AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { escapeHtml } from '../common/html.js';
import { MailService } from '../mail/mail.service.js';
import { wrapHtml } from '../mail/templates.js';
import { MAX_UPLOAD_BYTES, StorageService, type UploadedFile as Upload } from './storage.service.js';

const GUEST_PROMPT_LIMIT = 30_000;

/** Base44's Core integrations: UploadFile, InvokeLLM and SendEmail. */
@Controller('integrations')
@Public()
export class IntegrationsController {
  constructor(
    private readonly storage: StorageService,
    private readonly ai: AiService,
    private readonly mail: MailService,
  ) {}

  /** Guests upload too (job applications, advocate sign-up), so this is rate-limited by IP. */
  @Post('upload-file')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@UploadedFile() file: Upload | undefined, @CurrentUser() user: AuthUser | undefined) {
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    return this.storage.upload(file, user?.email);
  }

  /** Guests (e.g. blog translation) get plain prompts only, at a lower rate. */
  @Post('invoke-llm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invokeLlm(@Body() body: InvokeOptions, @CurrentUser() user: AuthUser | undefined) {
    if (!user && (body.file_urls?.length || body.add_context_from_internet || (body.prompt?.length ?? 0) > GUEST_PROMPT_LIMIT)) {
      throw new ForbiddenException('Log in to use files, web search or long prompts');
    }
    return this.ai.invoke({
      prompt: body.prompt,
      response_json_schema: body.response_json_schema,
      file_urls: body.file_urls,
      add_context_from_internet: body.add_context_from_internet,
    });
  }

  /** Admins may email anyone; others only themselves or our own inboxes, as plain text. */
  @Post('send-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async sendEmail(
    @Body() body: { to?: string; subject?: string; body?: string },
    @CurrentUser() user: AuthUser | undefined,
  ) {
    const to = body.to?.trim().toLowerCase();
    if (!to || !body.subject || !body.body) throw new BadRequestException('to, subject and body are required');
    const admin = isAdmin(user);
    if (!admin && !this.mail.adminInboxes.includes(to) && to !== user?.email) {
      throw new ForbiddenException('You can only email yourself or MyAdhikaar support');
    }
    const html = admin ? body.body : `<p>${escapeHtml(body.body).replace(/\n/g, '<br>')}</p>`;
    await this.mail.send({ to, subject: body.subject.slice(0, 200), html: wrapHtml(html) });
    return { success: true };
  }
}
