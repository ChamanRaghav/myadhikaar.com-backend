import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AgentsService } from './agents.service.js';

/** Base44 agents API: createConversation, addMessage, subscribeToConversation. */
@Controller('agents/conversations')
@Public()
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser | undefined, @Body() body: { agent_name?: string; metadata?: Record<string, unknown> }) {
    return this.agents.create(user, body ?? {});
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string) {
    return this.agents.get(user, id);
  }

  @Post(':id/messages')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addMessage(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string, @Body() body: { role?: string; content?: string; file_urls?: string[] }) {
    return this.agents.addMessage(user, id, body ?? {});
  }

  /** Server-Sent Events with the whole conversation on every change. */
  @Get(':id/stream')
  @SkipThrottle()
  async stream(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    let cleanup = () => {};
    let started = false;
    const send = (data: unknown) => {
      if (!started) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        started = true;
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
      await this.agents.subscribe(user, id, send, (fn) => (cleanup = fn));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({ statusCode: status, message: (err as Error).message });
      return;
    }
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      cleanup();
    });
  }
}
