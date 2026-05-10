/**
 * Devices API Integration Tests
 * Validates: Requirements 2, 3
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

const mockIsMqttConnected = jest.fn<() => boolean>();
const mockPublishCommand = jest.fn<(deviceId: string, payload: object) => void>();

jest.unstable_mockModule('../../mqtt/client.js', () => ({
  isMqttConnected: mockIsMqttConnected,
  publishCommand: mockPublishCommand,
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

/** Sample device fixture */
const sampleDevice = {
  id: 'motor-01',
  type: 'motor',
  name: 'Test Motor',
  ip: '192.168.1.100',
  last_seen: new Date().toISOString(),
  last_status: { speed: 0 },
  online: true,
};

/** Sample device event fixture */
const sampleEvent = {
  id: BigInt(1),
  device_id: 'motor-01',
  ts: new Date().toISOString(),
  payload: { cmd: 'stop' },
};

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

describe('GET /api/v1/devices', () => {
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

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('无 token → 返回 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
    });

    expect(response.statusCode).toBe(401);
  });

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('有效 token → 返回 200 和设备数组', async () => {
    mockGetDevices.mockResolvedValue([sampleDevice]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<typeof sampleDevice[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('motor-01');
  });
});

describe('GET /api/v1/devices/:id/status', () => {
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
    mockGetDeviceStatus.mockReset();
    mockFindUserByUsername.mockReset();
  });

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('有效 token，设备存在 → 返回 200 和设备状态', async () => {
    mockGetDeviceStatus.mockResolvedValue(sampleDevice);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/motor-01/status',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<typeof sampleDevice>();
    expect(body.id).toBe('motor-01');
    expect(body.online).toBe(true);
  });

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('有效 token，设备不存在 → 返回 404', async () => {
    mockGetDeviceStatus.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/nonexistent/status',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ error: string }>();
    expect(body).toHaveProperty('error');
  });
});

describe('POST /api/v1/devices/:id/command', () => {
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
    mockIsMqttConnected.mockReset();
    mockPublishCommand.mockReset();
    mockFindUserByUsername.mockReset();
  });

  // ── Requirement 3 ─────────────────────────────────────────────────────────
  it('有效 token，MQTT 可用，有效 cmd → 返回 200', async () => {
    mockIsMqttConnected.mockReturnValue(true);
    mockPublishCommand.mockImplementation(() => undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/motor-01/command',
      headers: { Authorization: `Bearer ${token}` },
      payload: { cmd: 'run', speed: 100, direction: 'forward' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
    expect(mockPublishCommand).toHaveBeenCalledWith('motor-01', {
      cmd: 'run',
      speed: 100,
      direction: 'forward',
    });
  });

  // ── Requirement 3 ─────────────────────────────────────────────────────────
  it('无效 cmd → 返回 400', async () => {
    mockIsMqttConnected.mockReturnValue(true);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/motor-01/command',
      headers: { Authorization: `Bearer ${token}` },
      payload: { cmd: 'invalid-command' },
    });

    expect(response.statusCode).toBe(400);
  });

  // ── Requirement 3 ─────────────────────────────────────────────────────────
  it('MQTT 不可用 → 返回 503', async () => {
    mockIsMqttConnected.mockReturnValue(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/motor-01/command',
      headers: { Authorization: `Bearer ${token}` },
      payload: { cmd: 'stop' },
    });

    expect(response.statusCode).toBe(503);
    const body = response.json<{ error: string }>();
    expect(body).toHaveProperty('error');
  });
});

describe('GET /api/v1/devices/:id/history', () => {
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
    mockGetDeviceStatus.mockReset();
    mockGetDeviceHistory.mockReset();
    mockFindUserByUsername.mockReset();
  });

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('有效 token，设备存在 → 返回 200 和事件数组', async () => {
    mockGetDeviceStatus.mockResolvedValue(sampleDevice);
    mockGetDeviceHistory.mockResolvedValue([sampleEvent]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/motor-01/history',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<typeof sampleEvent[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].device_id).toBe('motor-01');
  });

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('有效 token，设备不存在 → 返回 404', async () => {
    mockGetDeviceStatus.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/nonexistent/history',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ error: string }>();
    expect(body).toHaveProperty('error');
  });

  // ── Requirement 2 ─────────────────────────────────────────────────────────
  it('无 token → 返回 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/motor-01/history',
    });

    expect(response.statusCode).toBe(401);
  });
});
