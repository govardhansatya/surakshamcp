import { Module } from '@nitrostack/core';
import { ComplianceTools } from './compliance.tools.js';
import { ComplianceResources } from './compliance.resources.js';
import { CompliancePrompts } from './compliance.prompts.js';

@Module({
  name: 'compliance',
  description: 'Regulation-cited safety reporting + regulation/incident Resources + investigation Prompts.',
  controllers: [ComplianceTools, ComplianceResources, CompliancePrompts],
  providers: [],
})
export class ComplianceModule {}
