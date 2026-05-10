import { useEffect, useRef, useState, useCallback } from "react";
import type { MotorStatus, WsMessage } from "@/lib/api";

const WS_URL = import.meta.env.VITE_ESP32_WS ?? `ws://${window.location.hostname}:81/ws`;

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseMotorWsReturn {
  status:   MotorStatus | null;
  wsStatus: WsStatus;
  latency:  number;            // round-trip ms (ping/pong not supported on ESP32, estimated)
  send:     (msg: WsMessage) => void;
  reconnect: () => void;
}

const RECONNECT_DELAY = 2000;
const MAX_RETRIES     = 10;

export function useMotorWs(): UseMotorWsReturn {
  const [motorStatus, setMotorStatus] = useState<MotorStatus | null>(null);
  const [wsStatus,    setWsStatus]    = useState<WsStatus>("connecting");
  const [latency,     setLatency]     = useState(0);

  const wsRef      = useRef<WebSocket | null>(null);
  const retries    = useRef(0);
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMsgAt  = useRef<number>(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      retries.current = 0;
    };

    ws.onmessage = (evt) => {
      try {
        const now = Date.now();
        const delta = lastMsgAt.current ? now - lastMsgAt.current : 0;
        lastMsgAt.current = now;
        // Use inter-message delta as a proxy for round-trip (broadcast every 100ms)
        if (delta > 0 && delta < 1000) setLatency(delta);

        const data = JSON.parse(evt.data) as MotorStatus;
        setMotorStatus(data);
      } catch {/* ignore malformed */}
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      wsRef.current = null;
      if (retries.current < MAX_RETRIES) {
        retries.current++;
        reconnTimer.current = setTimeout(connect, RECONNECT_DELAY);
      } else {
        setWsStatus("error");
      }
    };

    ws.onerror = () => {
      setWsStatus("error");
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const reconnect = useCallback(() => {
    retries.current = 0;
    wsRef.current?.close();
    connect();
  }, [connect]);

  return { status: motorStatus, wsStatus, latency, send, reconnect };
}
