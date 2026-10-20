import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../common/auth-user.js';
import type { Env } from '../config/env.js';
import { PolicyContext } from '../entities/policy-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Video rooms on Daily.co, one per consultation, for its client and lawyer only. */
@Injectable()
export class DailyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createRoom(user: AuthUser, body: { consultationId?: string }) {
    const key = this.config.get('DAILY_API_KEY', { infer: true });
    if (!key) throw new ServiceUnavailableException('Video calls are not configured');
    if (!body.consultationId) throw new BadRequestException('consultationId is required');
    const consultation = await this.prisma.consultation.findUnique({ where: { id: body.consultationId } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    const isLawyer = (await new PolicyContext(user, this.prisma).lawyerIds()).includes(consultation.lawyer_id ?? '');
    if (!isLawyer && consultation.client_email !== user.email && user.role !== 'admin') {
      throw new NotFoundException('Consultation not found');
    }

    const call = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.daily.co/v1${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const name = `consultation-${consultation.id}`;
    let res = await call('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        name,
        properties: { enable_screenshare: false, enable_chat: false, exp, max_participants: 2, enable_prejoin_ui: false, enable_network_ui: false },
      }),
    });
    if (!res.ok) {
      // Room exists already: extend its expiry so the call doesn't end mid-way
      res = await call(`/rooms/${name}`, { method: 'POST', body: JSON.stringify({ properties: { exp } }) });
      if (!res.ok) throw new ServiceUnavailableException('Could not create the video room');
    }
    const room = (await res.json()) as { url: string; name: string };
    // Only the consultation's lawyer controls the room
    const tokenRes = await call('/meeting-tokens', {
      method: 'POST',
      body: JSON.stringify({ properties: { room_name: room.name, exp, is_owner: isLawyer, enable_recording: false } }),
    });
    const token = tokenRes.ok ? ((await tokenRes.json()) as { token: string }).token : null;
    return { url: room.url, name: room.name, token };
  }
}
