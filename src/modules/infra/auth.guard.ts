// Simple API-key guard for heavy/sensitive tools.
// Apply with @UseGuards(ApiKeyGuard) on a tool or module.
// NitroStack also ships a full ApiKeyModule (multi-key, hashing) — this is the minimal
// single-shared-key version, matching MCP_API_KEY in .env.
import { Injectable, type Guard, type ExecutionContext } from '@nitrostack/core';

@Injectable()
export class ApiKeyGuard implements Guard {
  private readonly key = process.env.MCP_API_KEY ?? 'dev-key-change-me';

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Header-derived values land on ctx.metadata, not ctx.request (ExecutionContext has no
    // `request` field — see @nitrostack/core's types.d.ts).
    const provided = ctx.metadata?.['x-api-key'] ?? ctx.metadata?.apiKey;
    if (provided !== this.key) {
      throw new Error('Unauthorized: invalid or missing x-api-key.');
    }
    ctx.auth = { subject: 'api-key-client', scopes: ['*'] };
    return true;
  }
}
