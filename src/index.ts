// SurakshaMCP — application entry point
// Bootstraps the NitroStack MCP server.
import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && (process.env.MCP_API_KEY ?? 'dev-key-change-me') === 'dev-key-change-me') {
    console.error('Refusing to start: MCP_API_KEY is unset (or still the public default) in production. Set a real secret.');
    process.exit(1);
  }
  const server = await McpApplicationFactory.create(AppModule);
  await server.start();
  // NitroStack prints the local URL / transport; in production `nitro deploy`
  // exposes the public MCP URL required by hackathon rule R13.
  console.log('🦺 SurakshaMCP server started.');
}

bootstrap().catch((err) => {
  console.error('Failed to start SurakshaMCP:', err);
  process.exit(1);
});
