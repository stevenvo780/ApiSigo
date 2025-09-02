import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'x-email',
      'x-api-key',
      'x-hub-signature',
      'Idempotency-Key',
      'Partner-Id',
    ],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: false,
    forbidUnknownValues: false,
    transform: true,
    validateCustomDecorators: true,
  }));

  const PORT = Number(process.env.PORT) || 8080;
  await app.listen(PORT);
  // eslint-disable-next-line no-console
  console.info(`\n🚀 SIGO API (Nest) iniciado\n📍 Puerto: ${PORT}\n🌍 Entorno: ${process.env.NODE_ENV || 'development'}\n🔗 URL: http://localhost:${PORT}\n📚 Docs: http://localhost:${PORT}/api/docs\n`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error al iniciar Nest:', err);
  process.exit(1);
});

export {};
