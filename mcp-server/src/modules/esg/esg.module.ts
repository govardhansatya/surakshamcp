import { Module } from '@nitrostack/core';
import { EsgTools } from './esg.tools.js';
import { EsgResources } from './esg.resources.js';
import { EsgPrompts } from './esg.prompts.js';

@Module({
  name: 'esg',
  description: 'BRSR Principle-3 (SEBI ESG) safety disclosure: report tool, rolling summary + methodology Resources, disclosure Prompt.',
  controllers: [EsgTools, EsgResources, EsgPrompts],
  providers: [],
})
export class EsgModule {}
