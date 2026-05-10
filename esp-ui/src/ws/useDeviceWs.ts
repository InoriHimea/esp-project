import { useEffect, useRef, useState, useCallback } from "react";
import { getToken } from "../auth/tokenStore";

export interface DeviceStatus {
  device_type: string;
  state: "running" | "stopped" | "braking" | "coasting";
  speed: number;
  speed_pct: string;
  direction: "forward" | "backward";
  uptime_ms: number;
  ip: string;
}

interface WsStatusMessage {
  type: "status";
  device_id: string;
  payload: DeviceStatus;
}

const RECONNECT_DELAY = 3000;

export function useDeviceWs(): Map<string, DeviceStatus> {
  const [deviceMap, setDeviceMap] = useState<Map<string, DeviceStatus>>(
    new Map()
  );

  const wsRef = useRef<WebSocket | null>(null);
  const reconnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = getToken();
    const baseUrl = import.meta.env.VITE_SERVER_WS as string;
    const url = token ? `${baseUrl}?token=${token}` : baseUrl;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as WsStatusMessage;
        if (msg.type === "status" && msg.device_id && msg.payload) {
          setDeviceMap((prev) => {
            const next = new Map(prev);
            next.set(msg.device_id, msg.payload);
            return next;
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!unmountedRef.current) {
        reconnTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnTimerRef.current) {
        clearTimeout(reconnTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return deviceMap;
}
