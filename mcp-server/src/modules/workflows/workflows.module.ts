import { Module } from '@nitrostack/core';
import { AuditTools } from './audit.tools.js';
import { SafetyModule } from '../safety/safety.module.js';
import { LanguageModule } from '../language/language.module.js';
import { InfraModule } from '../infra/infra.module.js';

@Module({
  name: 'workflows',
  description: 'Orchestrated end-to-end audit (hero long-running MCP Task).',
  controllers: [AuditTools],
  imports: [SafetyModule, LanguageModule, InfraModule], // InfraModule for LoggingInterceptor
})
export class WorkflowsModule {}
