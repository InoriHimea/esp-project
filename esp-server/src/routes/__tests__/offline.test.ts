/**
 * Device Offline Detection Tests
 * Validates: Requirements 2.6
 *
 * Tests that GET /api/v1/devices correctly reflects the `online` field
 * based on the `last_seen` timestamp returned by getDevices().
 *
 * The `online` field is computed by the DB query:
 *   (last_seen > NOW() - INTERVAL '30 seconds')
 * In tests, we mock getDevices() to return pre-computed `online` values
 * that simulate different last_seen scenarios.
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// In ESM, jest.unstable_mockModule must be called before the modules are imported.

jest.unstable_mockModule('../../db/client.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../mqtt/client.js', () => ({
  isMqttConnected: jest.fn().mockReturnValue(false),
  publishCommand: jest.fn(),
  initMqtt: jest.fn().mockResolvedValue(undefined),
}));

const mockGetDevices = jest.fn();
const mockGetDeviceStatus = jest.fn();
const mockGetDeviceHistory = jest.fn();
const mockFindUserByUsername = jest.fn();
const mockCreateUserIfNotExists = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db/queries.js', () => ({
  getDevices: mockGetDevices,
  getDeviceStatus: mockGetDeviceStatus,
  getDeviceHistory: mockGetDeviceHistory,
  findUserByUsername: mockFindUserByUsername,
  createUserIfNotExists: mockCreateUserIfNotExists,
}));

// ─── Dynamic imports (after mocks are registered) ────────────────────────────
const { default: Fastify } = await import('fastify');
const { default: bcrypt } = await import('bcrypt');
const { authPlugin } = await import('../../auth/plugin.js');
const { authRoutes } = await import('../../auth/routes.js');
const { devicesRoutes } = await import('../devices.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a test Fastify instance with authPlugin, authRoutes, and devicesRoutes.
 */
async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(authPlugin);
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(devicesRoutes, { prefix: '/api/v1' });

  await app.ready();
  return app;
}

/**
 * Obtain a valid JWT token by logging in via the test app.
 */
async function getToken(app: Awaited<ReturnType<typeof buildTestApp>>): Promise<string> {
  const passwordHash = await bcrypt.hash('test-password', 10);
  mockFindUserByUsername.mockResolvedValueOnce({
    id: 1,
    username: 'admin',
    password: passwordHash,
  });

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'admin', password: 'test-password' },
  });

  expect(loginResponse.statusCode).toBe(200);
  const { token } = loginResponse.json<{ token: string }>();
  return token;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('设备离线检测 — GET /api/v1/devices (Requirement 2.6)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp();
    token = await getToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockGetDevices.mockReset();
    mockFindUserByUsername.mockReset();
  });

  // ── Requirement 2.6 ──────────────────────────────────────────────────────────
  it('last_seen 超过 30 秒前 → online: false', async () => {
    // Simulate: DB computed online=false because last_seen > 30s ago
    const lastSeenOld = new Date(Date.now() - 60_000).toISOString(); // 60 seconds ago
    mockGetDevices.mockResolvedValue([
      {
        id: 'motor-01',
        type: 'motor',
        name: 'Test Motor',
        ip: '192.168.1.100',
        last_seen: lastSeenOld,
        last_status: { speed: 0 },
        online: false, // DB computed: last_seen is 60s ago, > 30s threshold
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ id: string; online: boolean }[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('motor-01');
    expect(body[0].online).toBe(false);
  });

  // ── Requirement 2.6 ──────────────────────────────────────────────────────────
  it('last_seen 在 30 秒内 → online: true', async () => {
    // Simulate: DB computed online=true because last_seen is within 30s
    const lastSeenRecent = new Date(Date.now() - 10_000).toISOString(); // 10 seconds ago
    mockGetDevices.mockResolvedValue([
      {
        id: 'motor-01',
        type: 'motor',
        name: 'Test Motor',
        ip: '192.168.1.100',
        last_seen: lastSeenRecent,
        last_status: { speed: 100 },
        online: true, // DB computed: last_seen is 10s ago, within 30s threshold
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ id: string; online: boolean }[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('motor-01');
    expect(body[0].online).toBe(true);
  });

  // ── Requirement 2.6 ──────────────────────────────────────────────────────────
  it('last_seen 为 null → online: false', async () => {
    // Simulate: DB computed online=false because last_seen IS NULL
    // In SQL: (NULL > NOW() - INTERVAL '30 seconds') evaluates to NULL,
    // which the query maps to false via the ?? false fallback.
    mockGetDevices.mockResolvedValue([
      {
        id: 'motor-02',
        type: 'motor',
        name: 'Never Seen Motor',
        ip: null,
        last_seen: null,
        last_status: null,
        online: false, // DB computed: NULL last_seen → online is NULL → false
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ id: string; online: boolean; last_seen: string | null }[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('motor-02');
    expect(body[0].last_seen).toBeNull();
    expect(body[0].online).toBe(false);
  });
});
