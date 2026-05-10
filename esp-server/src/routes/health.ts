import type { FastifyInstance } from 'fastify';
import { isMqttConnected } from '../mqtt/client.js';
import sql from '../db/client.js';

export async function healthRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', { config: { skipAuth: true } }, async (_request, reply) => {
    // Check DB connectivity
    let dbOk = false;
    try {
      await sql`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return reply.send({
      status: 'ok',
      mqtt: isMqttConnected(),
      db: dbOk,
      uptime: process.uptime(),
    });
  });
}
