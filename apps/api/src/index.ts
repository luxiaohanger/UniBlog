import { createApp } from './app';
import { config } from './lib/config';
import { logger } from './lib/logger';

const app = createApp();

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'api_listen');
});

