import { Module } from '@nitrostack/core';
import { SafetyTools } from './safety.tools.js';
import { SafetyService } from './safety.service.js';
import { InferenceClient } from '../../common/inference.client.js';

@Module({
  name: 'safety',
  description: 'PPE and hazard detection from site imagery (vision transfer-learning model).',
  controllers: [SafetyTools],
  providers: [SafetyService, InferenceClient],
  exports: [SafetyService, InferenceClient],
})
export class SafetyModule {}
