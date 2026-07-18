import { Module } from '@nitrostack/core';
import { NotifyTools } from './notify.tools.js';
import { InfraModule } from '../infra/infra.module.js';

@Module({
  name: 'notify',
  description: 'Outbound alert channels — WhatsApp (Twilio) delivery of text + voice-note safety alerts.',
  controllers: [NotifyTools],
  providers: [],
  imports: [InfraModule], // for ApiKeyGuard on the two sensitive tools
})
export class NotifyModule {}
