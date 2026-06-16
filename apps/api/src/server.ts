import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createTwilioService } from './services/twilio.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const twilio = createTwilioService(config);
  const app = await buildApp({ config, twilio });

  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
