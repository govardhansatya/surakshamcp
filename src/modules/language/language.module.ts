import { Module } from '@nitrostack/core';
import { LanguageTools } from './language.tools.js';
import { LanguageService } from './language.service.js';
import { InferenceClient } from '../../common/inference.client.js';

@Module({
  name: 'language',
  description: 'Worker spoken-language identification + multilingual voice alerts (10 Indian languages).',
  controllers: [LanguageTools],
  providers: [LanguageService, InferenceClient],
  exports: [LanguageService],
})
export class LanguageModule {}
