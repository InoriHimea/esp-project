import type { FastifyInstance } from 'fastify';
import {
  getDevices,
  getDeviceStatus,
  getDeviceHistory,
} from '../db/queries.js';
import { isMqttConnected, publishCommand } from '../mqtt/client.js';

// ─── Schema definitions ───────────────────────────────────────────────────────

const deviceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    name: { type: ['string', 'null'] },
    ip: { type: ['string', 'null'] },
    last_seen: { type: ['string', 'null'], format: 'date-time' },
    last_status: { type: ['object', 'null'] },
    online: { type: 'boolean' },
  },
} as const;

const deviceEventSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    device_id: { type: 'string' },
    ts: { type: 'string', format: 'date-time' },
    payload: { type: 'object' },
  },
} as const;

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function devicesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /devices ────────────────────────────────────────────────────────────
  fastify.get(
    '/devices',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'List all devices',
        description: 'Returns all registered devices with their online status.',
        response: {
          200: {
            type: 'array',
            items: deviceSchema,
          },
        },
      },
    },
    async (_request, reply) => {
      const devices = await getDevices();
      return reply.send(devices);
    },
  );

  // ── GET /devices/:id/status ─────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/devices/:id/status',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'Get device status',
        description: 'Returns the latest status for the specified device.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: deviceSchema,
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const device = await getDeviceStatus(id);
      if (!device) {
        return reply.code(404).send({ error: 'Device not found' });
      }
      return reply.send(device);
    },
  );

  // ── POST /devices/:id/command ───────────────────────────────────────────────
  fastify.post<{
    Params: { id: string };
    Body: {
      cmd: 'run' | 'stop' | 'brake' | 'coast';
      speed?: number;
      direction?: string;
      ramp_ms?: number;
    };
  }>(
    '/devices/:id/command',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'Send command to device',
        description: 'Publishes a command to the device via MQTT.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['cmd'],
          properties: {
            cmd: {
              type: 'string',
              enum: ['run', 'stop', 'brake', 'coast'],
              description: 'Motor command',
            },
            speed: {
              type: 'integer',
              minimum: 0,
              description: 'Motor speed (optional)',
            },
            direction: {
              type: 'string',
              enum: ['forward', 'backward'],
              description: 'Motor direction (optional)',
            },
            ramp_ms: {
              type: 'integer',
              minimum: 0,
              description: 'Ramp duration in milliseconds (optional)',
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isMqttConnected()) {
        return reply.code(503).send({ error: 'MQTT broker unavailable' });
      }

      const { id } = request.params;
      const { cmd, speed, direction, ramp_ms } = request.body;

      // Build payload — only include optional fields when provided
      const payload: Record<string, unknown> = { cmd };
      if (speed !== undefined) payload.speed = speed;
      if (direction !== undefined) payload.direction = direction;
      if (ramp_ms !== undefined) payload.ramp_ms = ramp_ms;

      publishCommand(id, payload);

      return reply.send({ ok: true });
    },
  );

  // ── GET /devices/:id/history ────────────────────────────────────────────────
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: number; offset?: number };
  }>(
    '/devices/:id/history',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['devices'],
        security: [{ bearerAuth: [] }],
        summary: 'Get device event history',
        description: 'Returns paginated event history for the specified device.',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              default: 50,
              description: 'Number of records to return',
            },
            offset: {
              type: 'integer',
              minimum: 0,
              default: 0,
              description: 'Number of records to skip',
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: deviceEventSchema,
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const limit = request.query.limit ?? 50;
      const offset = request.query.offset ?? 0;

      // Verify device exists before querying history
      const device = await getDeviceStatus(id);
      if (!device) {
        return reply.code(404).send({ error: 'Device not found' });
      }

      const events = await getDeviceHistory(id, limit, offset);
      return reply.send(events);
    },
  );
}
