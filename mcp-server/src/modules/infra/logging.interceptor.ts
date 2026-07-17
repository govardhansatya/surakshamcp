// Structured logging of every tool call: name, latency, status.
// Apply globally or with @UseInterceptors(LoggingInterceptor).
import { Injectable, type InterceptorInterface, type ExecutionContext } from '@nitrostack/core';

@Injectable()
export class LoggingInterceptor implements InterceptorInterface {
  async intercept(ctx: ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
    const started = Date.now();
    const tool = (ctx as any)?.toolName ?? 'unknown';
    try {
      const result = await next();
      ctx.logger?.info('tool_call', { tool, status: 'ok', ms: Date.now() - started });
      return result;
    } catch (err) {
      ctx.logger?.error('tool_call', { tool, status: 'error', ms: Date.now() - started, err: String(err) });
      throw err;
    }
  }
}
