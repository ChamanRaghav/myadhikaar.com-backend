import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Env } from './config/env.js';

/** Shared by main.ts and the e2e tests so both run the same HTTP setup. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Railway terminates TLS in front of the app; trust its X-Forwarded-For for client IPs.
  app.set('trust proxy', 1);
  app.use(helmet());
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: origins.length ? origins : [config.get('APP_URL', { infer: true })],
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MyAdhikaar API').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
}
