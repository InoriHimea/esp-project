import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

// ─── WsManager ────────────────────────────────────────────────────────────────

/**
 * Manages all authenticated WebSocket client connections and provides
 * a broadcast method to push messages to every connected client.
 */
export class WsManager {
  private clients: Set<WebSocket> = new Set();

  /**
   * Register a new WebSocket connection.
   */
  add(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.remove(ws));
  }

  /**
   * Remove a WebSocket connection from the managed set.
   */
  remove(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Broadcast a JSON-serialisable message to all connected clients.
   * Clients that have already closed are silently skipped.
   */
  broadcast(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      // readyState 1 === OPEN
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  /**
   * Returns the number of currently connected clients.
   */
  get size(): number {
    return this.clients.size;
  }
}

/** Singleton WsManager instance shared across the application. */
export const wsManager = new WsManager();

// ─── Fastify Route ────────────────────────────────────────────────────────────

export async function wsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    // Read token from query param ?token=<jwt>
    const token = (request.query as Record<string, string>)['token'];

    if (!token) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    try {
      fastify.jwt.verify(token);
    } catch {
      socket.close(4001, 'Unauthorized');
      return;
    }

    // Token is valid — register the connection
    wsManager.add(socket);
  });
}
