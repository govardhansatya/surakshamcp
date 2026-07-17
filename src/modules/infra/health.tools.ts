// TOOL: health_check — verifies the server + inference backend are reachable.
import { ToolDecorator as Tool, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { InferenceClient } from '../../common/inference.client.js';

@Injectable({ deps: [InferenceClient] })
export class HealthTools {
  constructor(private readonly inference: InferenceClient) {}

  @Tool({
    name: 'health_check',
    description: 'Report server health and whether the model inference backend is reachable.',
    inputSchema: z.object({}),
    taskSupport: 'forbidden',
  })
  async healthCheck(_input: unknown, _ctx: ExecutionContext) {
    const backend = await this.inference.health();
    return {
      server: 'ok',
      inferenceBackend: backend.ok ? 'ok' : 'unreachable',
      backendDetail: backend.detail,
      time: new Date().toISOString(),
    };
  }
}
