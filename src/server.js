import express from 'express';
import { logger } from './logger.js';

export function createServer({ config, bot, getHealth }) {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    const health = getHealth();
    res.status(health.ok ? 200 : 503).json(health);
  });

  app.post(`/telegram/webhook/${config.webhookSecret}`, async (req, res) => {
    try {
      await bot.handleUpdate(req.body, res);
      if (!res.headersSent) res.sendStatus(200);
    } catch (error) {
      logger.error('webhook update failed', { error: error.message });
      if (!res.headersSent) res.sendStatus(500);
    }
  });

  app.use((_req, res) => {
    res.sendStatus(404);
  });

  return app;
}
