import mqtt, { type MqttClient } from 'mqtt';
import { handleMqttMessage } from './handler.js';

/** Tracks whether the MQTT client is currently connected. */
let _mqttConnected = false;

/** The active MQTT client instance. */
let _client: MqttClient | null = null;

/** Current reconnect delay in milliseconds (exponential backoff). */
let _reconnectDelay = 1000;

/** Maximum reconnect delay in milliseconds. */
const MAX_RECONNECT_DELAY = 30_000;

/** Topic to subscribe to for device status updates. */
const STATUS_TOPIC = 'esp/devices/+/status';

/**
 * Returns true if the MQTT client is currently connected to the broker.
 */
export function isMqttConnected(): boolean {
  return _mqttConnected;
}

/**
 * Initialise the MQTT client, subscribe to device status topics,
 * and wire up message handlers with exponential backoff reconnection.
 */
export async function initMqtt(): Promise<void> {
  const broker = process.env.MQTT_BROKER;

  if (!broker) {
    console.warn('[MQTT] MQTT_BROKER is not set — running without MQTT support');
    return;
  }

  const options: mqtt.IClientOptions = {
    // Disable the built-in reconnect so we can manage it ourselves
    reconnectPeriod: 0,
  };

  if (process.env.MQTT_USERNAME) {
    options.username = process.env.MQTT_USERNAME;
  }
  if (process.env.MQTT_PASSWORD) {
    options.password = process.env.MQTT_PASSWORD;
  }

  const connect = (): void => {
    console.log(`[MQTT] Connecting to ${broker}…`);
    const client = mqtt.connect(broker, options);
    _client = client;

    client.on('connect', () => {
      console.log('[MQTT] Connected');
      _mqttConnected = true;
      _reconnectDelay = 1000; // reset backoff on successful connect

      client.subscribe(STATUS_TOPIC, (err) => {
        if (err) {
          console.error('[MQTT] Failed to subscribe to', STATUS_TOPIC, err);
        } else {
          console.log('[MQTT] Subscribed to', STATUS_TOPIC);
        }
      });
    });

    client.on('message', (topic: string, payload: Buffer) => {
      handleMqttMessage(topic, payload);
    });

    client.on('disconnect', () => {
      console.warn('[MQTT] Disconnected');
      _mqttConnected = false;
    });

    client.on('offline', () => {
      console.warn('[MQTT] Client offline');
      _mqttConnected = false;
    });

    client.on('error', (err: Error) => {
      console.error('[MQTT] Error:', err.message);
      _mqttConnected = false;
    });

    client.on('close', () => {
      _mqttConnected = false;
      console.warn(`[MQTT] Connection closed — reconnecting in ${_reconnectDelay / 1000}s`);

      setTimeout(() => {
        connect();
        // Double the delay for next attempt, capped at MAX_RECONNECT_DELAY
        _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY);
      }, _reconnectDelay);
    });
  };

  connect();
}

/**
 * Publish a command payload to a device's command topic.
 *
 * @param deviceId - The target device ID (e.g. "motor-01")
 * @param payload  - The command object to publish as JSON
 */
export function publishCommand(deviceId: string, payload: object): void {
  if (!_mqttConnected || !_client) {
    console.warn(`[MQTT] Cannot publish command to device "${deviceId}" — not connected`);
    return;
  }

  const topic = `esp/devices/${deviceId}/command`;
  const message = JSON.stringify(payload);

  _client.publish(topic, message, (err) => {
    if (err) {
      console.error(`[MQTT] Failed to publish to ${topic}:`, err.message);
    }
  });
}
