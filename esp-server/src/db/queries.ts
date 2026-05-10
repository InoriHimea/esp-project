import sql from './client';

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface Device {
  id: string;
  type: string;
  name: string | null;
  ip: string | null;
  last_seen: Date | null;
  last_status: Record<string, unknown> | null;
  online: boolean;
}

export interface DeviceEvent {
  id: bigint;
  device_id: string;
  ts: Date;
  payload: Record<string, unknown>;
}

export interface User {
  id: number;
  username: string;
  password: string;
}

// ─── Device Queries ───────────────────────────────────────────────────────────

/**
 * UPSERT a device record. Updates ip, last_seen, and last_status on conflict.
 */
export async function upsertDevice(
  id: string,
  type: string,
  ip: string,
  lastStatus: object,
): Promise<void> {
  await sql`
    INSERT INTO devices (id, type, ip, last_seen, last_status)
    VALUES (${id}, ${type}, ${ip}, NOW(), ${sql.json(lastStatus)})
    ON CONFLICT (id) DO UPDATE SET
      ip          = EXCLUDED.ip,
      last_seen   = EXCLUDED.last_seen,
      last_status = EXCLUDED.last_status
  `;
}

/**
 * Insert a new event record for a device.
 */
export async function insertEvent(
  deviceId: string,
  payload: object,
): Promise<void> {
  await sql`
    INSERT INTO device_events (device_id, payload)
    VALUES (${deviceId}, ${sql.json(payload)})
  `;
}

/**
 * Return all devices with an `online` boolean field.
 * A device is considered online if last_seen > NOW() - 30 seconds.
 */
export async function getDevices(): Promise<Device[]> {
  const rows = await sql<
    (Omit<Device, 'online'> & { online: boolean })[]
  >`
    SELECT
      id,
      type,
      name,
      ip,
      last_seen,
      last_status,
      (last_seen > NOW() - INTERVAL '30 seconds') AS online
    FROM devices
    ORDER BY id
  `;

  return rows.map((row) => ({ ...row, online: row.online ?? false }));
}

/**
 * Return the latest status for a single device.
 */
export async function getDeviceStatus(id: string): Promise<Device | null> {
  const rows = await sql<
    (Omit<Device, 'online'> & { online: boolean })[]
  >`
    SELECT
      id,
      type,
      name,
      ip,
      last_seen,
      last_status,
      (last_seen > NOW() - INTERVAL '30 seconds') AS online
    FROM devices
    WHERE id = ${id}
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, online: row.online ?? false };
}

/**
 * Return paginated event history for a device, ordered by ts DESC.
 */
export async function getDeviceHistory(
  id: string,
  limit: number,
  offset: number,
): Promise<DeviceEvent[]> {
  const rows = await sql<DeviceEvent[]>`
    SELECT id, device_id, ts, payload
    FROM device_events
    WHERE device_id = ${id}
    ORDER BY ts DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return rows;
}

// ─── User Queries ─────────────────────────────────────────────────────────────

/**
 * Find a user by username. Returns null if not found.
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const rows = await sql<User[]>`
    SELECT id, username, password
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a user if one with the given username does not already exist.
 * Uses INSERT ... ON CONFLICT DO NOTHING to avoid race conditions.
 */
export async function createUserIfNotExists(
  username: string,
  passwordHash: string,
): Promise<void> {
  await sql`
    INSERT INTO users (username, password)
    VALUES (${username}, ${passwordHash})
    ON CONFLICT (username) DO NOTHING
  `;
}
