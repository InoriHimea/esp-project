import { upsertDevice, insertEvent } from '../db/queries.js';
import { wsManager } from '../ws/handler.js';

/**
 * Handle an incoming MQTT message on a device status topic.
 *
 * Topic format: `esp/devices/{device_id}/status`
 *
 * On receipt the handler will:
 *  1. Extract the device_id from the topic.
 *  2. Parse the JSON payload (logs and returns on parse error — never throws).
 *  3. Upsert the device record in the database.
 *  4. Insert a new device_events row.
 *  5. Broadcast the status update to all connected WebSocket clients.
 *
 * All database operations are fire-and-forget (`.catch` error handling) so
 * that a slow or failing DB call never blocks the MQTT message loop.
 */
export function handleMqttMessage(topic: string, payload: Buffer): void {
  // ── 1. Extract device_id from topic ────────────────────────────────────────
  // Expected format: esp/devices/{device_id}/status
  const topicParts = topic.split('/');
  if (topicParts.length !== 4 || topicParts[0] !== 'esp' || topicParts[1] !== 'devices' || topicParts[3] !== 'status') {
    console.warn(`[MQTT] Unexpected topic format: ${topic}`);
    return;
  }
  const deviceId = topicParts[2];

  // ── 2. Parse JSON payload ──────────────────────────────────────────────────
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
  } catch (err) {
    console.error(`[MQTT] Failed to parse payload for topic "${topic}":`, err);
    return;
  }

  // ── 3. Extract device_type and ip ─────────────────────────────────────────
  // Support both "device_type" (firmware convention) and "type" as fallback.
  const deviceType =
    typeof data['device_type'] === 'string'
      ? data['device_type']
      : typeof data['type'] === 'string'
        ? data['type']
        : 'unknown';

  const ip =
    typeof data['ip'] === 'string' ? data['ip'] : '';

  // ── 4. Upsert device record (fire-and-forget) ──────────────────────────────
  upsertDevice(deviceId, deviceType, ip, data).catch((err: unknown) => {
    console.error(`[MQTT] upsertDevice failed for device "${deviceId}":`, err);
  });

  // ── 5. Insert event record (fire-and-forget) ───────────────────────────────
  insertEvent(deviceId, data).catch((err: unknown) => {
    console.error(`[MQTT] insertEvent failed for device "${deviceId}":`, err);
  });

  // ── 6. Broadcast to WebSocket clients ─────────────────────────────────────
  wsManager.broadcast({
    type: 'status',
    device_id: deviceId,
    payload: data,
  });
}
