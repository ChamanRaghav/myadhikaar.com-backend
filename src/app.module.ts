import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';
import { Env, validateEnv } from './config/env.js';
import { EntitiesModule } from './entities/entities.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: 60_000, limit: 300 }],
        // e2e tests send every request from one address
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthModule,
    EntitiesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Rate limiting runs before authentication
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
