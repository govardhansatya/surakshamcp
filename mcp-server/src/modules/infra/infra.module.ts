import { Module } from '@nitrostack/core';
import { HealthTools } from './health.tools.js';
import { ApiKeyGuard } from './auth.guard.js';
import { LoggingInterceptor } from './logging.interceptor.js';
import { InferenceClient } from '../../common/inference.client.js';

@Module({
  name: 'infra',
  description: 'Cross-cutting concerns: auth guard, logging interceptor, health check.',
  controllers: [HealthTools],
  providers: [ApiKeyGuard, LoggingInterceptor, InferenceClient],
  exports: [ApiKeyGuard, LoggingInterceptor],
})
export class InfraModule {}
