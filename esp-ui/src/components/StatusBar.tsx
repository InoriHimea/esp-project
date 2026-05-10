import type { WsStatus } from "@/hooks/useMotorWs";

interface StatusBarProps {
  wsStatus: WsStatus;
  latency:  number;
  ip:       string;
  uptime:   number;
  onReconnect: () => void;
}

const DOT_COLOR: Record<WsStatus, string> = {
  connected:    "var(--c-ok)",
  connecting:   "var(--c-warn)",
  disconnected: "var(--c-rev)",
  error:        "var(--c-rev)",
};

function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function StatusBar({ wsStatus, latency, ip, uptime, onReconnect }: StatusBarProps) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-2 text-xs font-mono rounded-lg flex-wrap"
      style={{ background: "var(--c-panel)", border: "1px solid var(--c-border)" }}
    >
      {/* WS dot */}
      <div className="flex items-center gap-1.5">
        <span
          className={wsStatus === "connecting" ? "animate-blink" : ""}
          style={{
            display: "inline-block",
            width: 7, height: 7,
            borderRadius: "50%",
            background: DOT_COLOR[wsStatus],
            boxShadow: wsStatus === "connected" ? `0 0 6px ${DOT_COLOR.connected}` : "none",
          }}
        />
        <span style={{ color: DOT_COLOR[wsStatus] }}>
          {wsStatus.toUpperCase()}
        </span>
      </div>

      {/* IP */}
      {ip && (
        <span style={{ color: "var(--c-muted)" }}>
          <span style={{ color: "var(--c-hint)" }}>IP </span>
          {ip}
        </span>
      )}

      {/* Latency */}
      {latency > 0 && (
        <span style={{ color: "var(--c-muted)" }}>
          <span style={{ color: "var(--c-hint)" }}>ΔT </span>
          {latency}ms
        </span>
      )}

      {/* Uptime */}
      {uptime > 0 && (
        <span style={{ color: "var(--c-muted)" }}>
          <span style={{ color: "var(--c-hint)" }}>UP </span>
          {formatUptime(uptime)}
        </span>
      )}

      {/* Reconnect button if needed */}
      {(wsStatus === "disconnected" || wsStatus === "error") && (
        <button
          onClick={onReconnect}
          className="ml-auto cursor-pointer text-xs px-2 py-0.5 rounded"
          style={{
            background: "var(--c-accent-dim)",
            color: "var(--c-accent)",
            border: "1px solid var(--c-accent-dim)",
          }}
        >
          reconnect
        </button>
      )}
    </div>
  );
}
