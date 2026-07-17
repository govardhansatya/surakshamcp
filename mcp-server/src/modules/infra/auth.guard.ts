// Simple API-key guard for heavy/sensitive tools.
// Apply with @UseGuards(ApiKeyGuard) on a tool or module.
// NOTE: NitroStack also ships JWT / OAuth 2.1 guards — see docs.nitrostack.ai (Security).
import { Injectable, type Guard, type ExecutionContext } from '@nitrostack/core';

@Injectable()
export class ApiKeyGuard implements Guard {
  private readonly key = process.env.MCP_API_KEY ?? 'dev-key-change-me';

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Header name depends on transport; adjust to NitroStack's context accessor.
    const provided =
      (ctx as any)?.request?.headers?.['x-api-key'] ??
      (ctx as any)?.metadata?.apiKey;
    if (provided !== this.key) {
      throw new Error('Unauthorized: invalid or missing x-api-key.');
    }
    return true;
  }
}
