import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { findUserByUsername } from '../db/queries.js';

// ─── Schema definitions ───────────────────────────────────────────────────────

const loginBodySchema = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
} as const;

const loginResponseSchema = {
  200: {
    type: 'object',
    properties: {
      token: { type: 'string' },
    },
    required: ['token'],
  },
  401: {
    type: 'object',
    properties: {
      error: { type: 'string' },
    },
    required: ['error'],
  },
} as const;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Login and obtain a JWT',
        body: loginBodySchema,
        response: loginResponseSchema,
      },
    },
    async (request, reply) => {
      const { username, password } = request.body as {
        username: string;
        password: string;
      };

      // 1. Look up the user
      const user = await findUserByUsername(username);

      // 2. Verify user exists and password matches
      if (!user) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // 3. Sign and return JWT
      const token = fastify.jwt.sign(
        { sub: user.id, username: user.username },
        { expiresIn: '24h' },
      );

      return reply.code(200).send({ token });
    },
  );
}
