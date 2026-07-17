// Root module — wires the domain modules into one MCP server.
import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SafetyModule } from './modules/safety/safety.module.js';
import { LanguageModule } from './modules/language/language.module.js';
import { ComplianceModule } from './modules/compliance/compliance.module.js';
import { WorkflowsModule } from './modules/workflows/workflows.module.js';
import { InfraModule } from './modules/infra/infra.module.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'suraksha-mcp',
    version: '0.1.0',
  },
})
@Module({
  name: 'suraksha',
  description:
    'Construction-safety intelligence: detect PPE/hazard violations, identify a worker\'s spoken language, and deliver spoken safety alerts + regulation-cited reports in 10 Indian languages.',
  imports: [
    ConfigModule.forRoot(),
    InfraModule,        // auth guard, logging interceptor, health tool
    SafetyModule,       // detect_ppe_violations (vision)
    LanguageModule,     // identify_worker_language, generate_voice_alert
    ComplianceModule,   // generate_safety_report + regulation Resources + Prompts
    WorkflowsModule,    // run_site_safety_audit (long-running MCP Task) — the hero
  ],
})
export class AppModule {}
