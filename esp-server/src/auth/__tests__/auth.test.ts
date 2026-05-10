/**
 * Authentication Unit Tests
 * Validates: Requirements 1.1, 1.2, 1.4, 1.5
 *
 * Environment variables (JWT_SECRET, DATABASE_URL) are set via jest.setup.js
 * which runs before any module is loaded.
 *
 * In ESM mode, jest.unstable_mockModule must be called before dynamic imports.
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// In ESM, jest.unstable_mockModule must be called before the modules are imported.

jest.unstable_mockModule('../../db/client.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../mqtt/client.js', () => ({
  isMqttConnected: jest.fn().mockReturnValue(false),
  initMqtt: jest.fn().mockResolvedValue(undefined),
}));

const mockFindUserByUsername = jest.fn();
const mockCreateUserIfNotExists = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db/queries.js', () => ({
  findUserByUsername: mockFindUserByUsername,
  createUserIfNotExists: mockCreateUserIfNotExists,
}));

// ─── Dynamic imports (after mocks are registered) ────────────────────────────
const { default: Fastify } = await import('fastify');
const { default: bcrypt } = await import('bcrypt');
const { authPlugin } = await import('../plugin.js');
const { authRoutes } = await import('../routes.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a test Fastify instance with authPlugin, authRoutes,
 * and a simple protected route for JWT verification tests.
 */
async function buildTestApp() {
  const app = Fastify({ logger: false });

  // Register auth plugin (JWT decorator + authenticate hook)
  await app.register(authPlugin);

  // Register auth routes under /api/v1
  await app.register(authRoutes, { prefix: '/api/v1' });

  // Protected test route — requires valid JWT
  app.get(
    '/api/v1/protected',
    { preHandler: [app.authenticate] },
    async (_request, reply) => {
      return reply.code(200).send({ message: 'ok' });
    },
  );

  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Authentication — POST /api/v1/auth/login', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let validPasswordHash: string;

  beforeAll(async () => {
    // Generate a bcrypt hash for the test password once
    validPasswordHash = await bcrypt.hash('correct-password', 10);
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockFindUserByUsername.mockReset();
  });

  // ── Requirement 1.1 ──────────────────────────────────────────────────────────
  it('有效凭据 → 返回 200 和 token', async () => {
    mockFindUserByUsername.mockResolvedValue({
      id: 1,
      username: 'admin',
      password: validPasswordHash,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'correct-password' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ token: string }>();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  // ── Requirement 1.2 ──────────────────────────────────────────────────────────
  it('无效密码 → 返回 401', async () => {
    mockFindUserByUsername.mockResolvedValue({
      id: 1,
      username: 'admin',
      password: validPasswordHash,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ error: string }>();
    expect(body).toHaveProperty('error');
  });

  // ── Requirement 1.2 ──────────────────────────────────────────────────────────
  it('用户不存在 → 返回 401', async () => {
    mockFindUserByUsername.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'nonexistent', password: 'any-password' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ error: string }>();
    expect(body).toHaveProperty('error');
  });
});

describe('Authentication — 受保护路由 JWT 验证', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let validPasswordHash: string;

  beforeAll(async () => {
    validPasswordHash = await bcrypt.hash('correct-password', 10);
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockFindUserByUsername.mockReset();
  });

  // ── Requirement 1.4 ──────────────────────────────────────────────────────────
  it('无 token 访问受保护路由 → 返回 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected',
      // No Authorization header
    });

    expect(response.statusCode).toBe(401);
  });

  // ── Requirement 1.5 ──────────────────────────────────────────────────────────
  it('有效 token 访问受保护路由 → 返回 200', async () => {
    // First, obtain a valid token via login
    mockFindUserByUsername.mockResolvedValue({
      id: 1,
      username: 'admin',
      password: validPasswordHash,
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'correct-password' },
    });

    expect(loginResponse.statusCode).toBe(200);
    const { token } = loginResponse.json<{ token: string }>();

    // Then use the token to access the protected route
    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/protected',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(protectedResponse.statusCode).toBe(200);
    const body = protectedResponse.json<{ message: string }>();
    expect(body.message).toBe('ok');
  });
});
