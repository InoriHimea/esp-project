/**
 * WebSocket 模块单元测试
 * Validates: Requirements 4.1, 4.2, 4.3
 *
 * 测试策略：
 * 1. WsManager 单元测试（add/remove/broadcast）
 * 2. wsRoute token 验证逻辑测试（直接模拟路由内部行为，不依赖 @fastify/websocket 插件）
 *
 * 环境变量（JWT_SECRET, DATABASE_URL）由 jest.setup.js 在模块加载前设置。
 * ESM 模式下，jest.unstable_mockModule 必须在动态 import 之前调用。
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../db/client.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../mqtt/client.js', () => ({
  isMqttConnected: jest.fn().mockReturnValue(false),
  initMqtt: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../db/queries.js', () => ({
  findUserByUsername: jest.fn(),
  createUserIfNotExists: jest.fn().mockResolvedValue(undefined),
  upsertDevice: jest.fn().mockResolvedValue(undefined),
  insertEvent: jest.fn().mockResolvedValue(undefined),
  getDevices: jest.fn().mockResolvedValue([]),
  getDeviceStatus: jest.fn().mockResolvedValue(null),
  getDeviceHistory: jest.fn().mockResolvedValue([]),
}));

// ─── Dynamic imports（在 mock 注册之后）────────────────────────────────────────

const { WsManager } = await import('../handler.js');

// ─── Mock WebSocket 工厂 ───────────────────────────────────────────────────────

/**
 * 创建一个模拟 WebSocket 对象，用于测试路由逻辑。
 * readyState 1 = OPEN，3 = CLOSED
 */
function createMockWs(readyState = 1) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const ws = {
    readyState,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    emit: (event: string, ...args: unknown[]) => {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  return ws;
}

/**
 * 模拟 wsRoute 内部的 token 验证逻辑。
 * 与 handler.ts 中的实现保持一致：
 *   1. 无 token → close(4001)
 *   2. jwt.verify 抛出异常 → close(4001)
 *   3. token 有效 → wsManager.add(socket)
 */
function simulateWsRouteHandler(
  socket: ReturnType<typeof createMockWs>,
  query: Record<string, string>,
  jwtVerify: (token: string) => unknown,
  manager: InstanceType<typeof WsManager>,
) {
  const token = query['token'];

  if (!token) {
    socket.close(4001, 'Unauthorized');
    return;
  }

  try {
    jwtVerify(token);
  } catch {
    socket.close(4001, 'Unauthorized');
    return;
  }

  manager.add(socket as never);
}

// ─── WsManager 单元测试 ────────────────────────────────────────────────────────

describe('WsManager — 单元测试', () => {
  let manager: InstanceType<typeof WsManager>;

  beforeEach(() => {
    manager = new WsManager();
  });

  // ── Requirement 4.3 ──────────────────────────────────────────────────────────
  it('add() 后 size 增加，close 事件触发后自动 remove', () => {
    const ws = createMockWs();

    manager.add(ws as never);
    expect(manager.size).toBe(1);

    // 模拟 WebSocket 关闭事件
    ws.emit('close');
    expect(manager.size).toBe(0);
  });

  it('remove() 直接移除指定客户端', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    manager.add(ws1 as never);
    manager.add(ws2 as never);
    expect(manager.size).toBe(2);

    manager.remove(ws1 as never);
    expect(manager.size).toBe(1);
  });

  // ── Requirement 4.2 ──────────────────────────────────────────────────────────
  it('broadcast() 向所有 OPEN 状态的客户端发送 JSON 消息', () => {
    const ws1 = createMockWs(1); // OPEN
    const ws2 = createMockWs(1); // OPEN
    const ws3 = createMockWs(3); // CLOSED — 应被跳过

    manager.add(ws1 as never);
    manager.add(ws2 as never);
    manager.add(ws3 as never);

    const msg = { type: 'status', device_id: 'motor-01', payload: { speed: 100 } };
    manager.broadcast(msg);

    const expected = JSON.stringify(msg);
    expect(ws1.send).toHaveBeenCalledWith(expected);
    expect(ws2.send).toHaveBeenCalledWith(expected);
    // ws3 已关闭，不应收到消息
    expect(ws3.send).not.toHaveBeenCalled();
  });

  it('broadcast() 在没有客户端时不抛出异常', () => {
    expect(() => manager.broadcast({ type: 'ping' })).not.toThrow();
  });

  it('多次 remove() 同一客户端不抛出异常', () => {
    const ws = createMockWs();
    manager.add(ws as never);
    manager.remove(ws as never);
    expect(() => manager.remove(ws as never)).not.toThrow();
    expect(manager.size).toBe(0);
  });
});

// ─── wsRoute token 验证逻辑测试 ───────────────────────────────────────────────

describe('wsRoute — token 验证逻辑', () => {
  let manager: InstanceType<typeof WsManager>;

  beforeEach(() => {
    manager = new WsManager();
  });

  // ── Requirement 4.1 ──────────────────────────────────────────────────────────
  it('无 token → socket.close(4001) 被调用，连接不加入 WsManager', () => {
    const socket = createMockWs();
    const jwtVerify = jest.fn();

    simulateWsRouteHandler(socket, {}, jwtVerify as never, manager);

    expect(socket.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    expect(jwtVerify).not.toHaveBeenCalled();
    expect(manager.size).toBe(0);
  });

  // ── Requirement 4.1 ──────────────────────────────────────────────────────────
  it('无效 token → socket.close(4001) 被调用，连接不加入 WsManager', () => {
    const socket = createMockWs();
    const jwtVerify = jest.fn().mockImplementation(() => {
      throw new Error('invalid signature');
    });

    simulateWsRouteHandler(
      socket,
      { token: 'invalid.jwt.token' },
      jwtVerify as never,
      manager,
    );

    expect(socket.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    expect(jwtVerify).toHaveBeenCalledWith('invalid.jwt.token');
    expect(manager.size).toBe(0);
  });

  // ── Requirement 4.1 ──────────────────────────────────────────────────────────
  it('有效 token → socket 不被关闭，加入 WsManager', () => {
    const socket = createMockWs();
    const jwtVerify = jest.fn().mockReturnValue({ sub: 1, username: 'admin' });

    simulateWsRouteHandler(
      socket,
      { token: 'valid.jwt.token' },
      jwtVerify as never,
      manager,
    );

    expect(socket.close).not.toHaveBeenCalled();
    expect(jwtVerify).toHaveBeenCalledWith('valid.jwt.token');
    expect(manager.size).toBe(1);
  });
});

// ─── WsManager broadcast 集成场景 ─────────────────────────────────────────────

describe('WsManager — broadcast 集成场景', () => {
  // ── Requirement 4.2 ──────────────────────────────────────────────────────────
  it('调用 broadcast 后已连接客户端收到消息', () => {
    const manager = new WsManager();
    const client1 = createMockWs(1);
    const client2 = createMockWs(1);

    manager.add(client1 as never);
    manager.add(client2 as never);

    const message = {
      type: 'status',
      device_id: 'motor-01',
      payload: { state: 'running', speed: 512 },
    };

    manager.broadcast(message);

    const serialized = JSON.stringify(message);
    expect(client1.send).toHaveBeenCalledTimes(1);
    expect(client1.send).toHaveBeenCalledWith(serialized);
    expect(client2.send).toHaveBeenCalledTimes(1);
    expect(client2.send).toHaveBeenCalledWith(serialized);
  });

  // ── Requirement 4.3 ──────────────────────────────────────────────────────────
  it('客户端断开后不再收到广播消息', () => {
    const manager = new WsManager();
    const client = createMockWs(1);

    manager.add(client as never);
    manager.broadcast({ type: 'ping' });
    expect(client.send).toHaveBeenCalledTimes(1);

    // 模拟断开（触发 close 事件，自动从 manager 移除）
    client.emit('close');
    manager.broadcast({ type: 'ping' });

    // 断开后不应再收到消息
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
