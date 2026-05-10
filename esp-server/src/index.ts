import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';
import bcrypt from 'bcrypt';

import { runMigrations } from './db/migrate.js';
import { createUserIfNotExists } from './db/queries.js';

// TODO: implement — auth plugin (registers @fastify/jwt + authenticate preHandler)
import { authPlugin } from './auth/plugin.js';

// TODO: implement — route handlers
import { authRoutes } from './auth/routes.js';
import { devicesRoutes } from './routes/devices.js';
import { healthRoute } from './routes/health.js';
import { wsRoute } from './ws/handler.js';

// TODO: implement — MQTT client initialisation
import { initMqtt } from './mqtt/client.js';

// ─── Environment variables ────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_USER = process.env.ADMIN_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'changeme';

// ─── Fastify instance ─────────────────────────────────────────────────────────

const fastify = Fastify({ logger: true });

// ─── Plugin registration ──────────────────────────────────────────────────────

await fastify.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'ESP Control Platform API',
      description: 'REST API for managing ESP32 devices',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
});

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/docs',
});

await fastify.register(fastifyWebsocket);

// Auth plugin — registers @fastify/jwt and fastify.authenticate decorator
await fastify.register(authPlugin);

// ─── Route registration ───────────────────────────────────────────────────────

await fastify.register(healthRoute);
await fastify.register(authRoutes, { prefix: '/api/v1' });
await fastify.register(devicesRoutes, { prefix: '/api/v1' });
await fastify.register(wsRoute);

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    // Run DB migrations (idempotent — safe on every startup)
    await runMigrations();

    // Seed admin user if it doesn't exist yet
    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    await createUserIfNotExists(ADMIN_USER, passwordHash);

    // Initialise MQTT client and subscribe to device topics
    await initMqtt();

    // Start HTTP server
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  fastify.log.info(`Received ${signal}, shutting down gracefully…`);
  await fastify.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ─── Bootstrap ────────────────────────────────────────────────────────────────

await start();
