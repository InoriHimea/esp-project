// ─────────────────────────────────────────────────────────────────────────────
//  API types — mirrors ESP32 firmware JSON schema
// ─────────────────────────────────────────────────────────────────────────────

export type MotorState     = "stopped" | "ramping" | "running" | "braking" | "coasting";
export type MotorDirection = "forward" | "reverse";

export interface MotorStatus {
  state:        MotorState;
  speed:        number;      // 0–1023 PWM duty
  speed_pct:    string;      // "73.4"
  target_speed: number;
  direction:    MotorDirection;
  max_speed:    number;
  ramp_ms:      number;
  uptime_ms:    number;
  ip:           string;
}

export interface MotorConfig {
  max_speed:   number;
  min_speed:   number;
  ramp_ms:     number;
  pwm_freq_hz: number;
}

export interface RunCommand {
  speed:     number;
  direction: MotorDirection;
  ramp_ms?:  number;
}

export interface WsMessage extends RunCommand {
  cmd: "run" | "stop" | "brake" | "coast";
}

// ─────────────────────────────────────────────────────────────────────────────
//  REST helpers
// ─────────────────────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_ESP32_API ?? "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: ()                     => apiFetch<MotorStatus>("/status"),
  run:    (cmd: RunCommand)      => apiFetch<MotorStatus>("/motor/run",   { method: "POST", body: JSON.stringify(cmd) }),
  stop:   ()                     => apiFetch<MotorStatus>("/motor/stop",  { method: "POST" }),
  brake:  ()                     => apiFetch<MotorStatus>("/motor/brake", { method: "POST" }),
  coast:  ()                     => apiFetch<MotorStatus>("/motor/coast", { method: "POST" }),
  getConfig: ()                  => apiFetch<MotorConfig>("/config"),
  setConfig: (cfg: Partial<MotorConfig>) =>
    apiFetch<{ ok: boolean }>("/config", { method: "POST", body: JSON.stringify(cfg) }),
};
