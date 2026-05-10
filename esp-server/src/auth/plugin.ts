import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPluginImpl(fastify: FastifyInstance): Promise<void> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  await fastify.register(jwt, { secret });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    },
  );
}

export const authPlugin = fp(authPluginImpl, { name: 'auth-plugin' });
export default authPlugin;
