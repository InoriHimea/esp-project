export type DeviceType = 'motor' | 'epaper' | 'unknown';
export type MotorState = 'stopped' | 'ramping' | 'running' | 'braking' | 'coasting' | 'unknown';
export type MotorDirection = 'forward' | 'reverse';
export type EpaperPanelType = 'mono' | 'color' | 'unknown';
export type EpaperState = 'idle' | 'rendering' | 'refreshing' | 'sleeping' | 'error' | 'unknown';

export interface DeviceRecord {
  id: string;
  type: string;
  name?: string | null;
  ip?: string | null;
  last_seen?: string | null;
  last_status?: DeviceStatus | null;
  online: boolean;
}

export interface DeviceStatusBase {
  device_type?: string;
  type?: string;
  state?: string;
  uptime_ms?: number;
  ip?: string;
  [key: string]: unknown;
}

export interface MotorDeviceStatus extends DeviceStatusBase {
  device_type: 'motor';
  state: MotorState;
  speed?: number;
  speed_pct?: string;
  direction?: MotorDirection | 'backward';
}

export interface EpaperDeviceStatus extends DeviceStatusBase {
  device_type: 'epaper';
  state?: EpaperState;
  panel_type?: EpaperPanelType;
  panel_model?: string;
  width?: number;
  height?: number;
  busy?: boolean;
  accent_color?: string;
  palette?: string[];
  last_refresh_ms?: number;
  refresh_count?: number;
  battery_mv?: number;
}

export type DeviceStatus = MotorDeviceStatus | EpaperDeviceStatus | DeviceStatusBase;

export type MotorCommand =
  | { cmd: 'run'; speed?: number; direction?: MotorDirection; ramp_ms?: number }
  | { cmd: 'stop' | 'brake' | 'coast' };

export type EpaperCommand =
  | { cmd: 'display_text'; text: string; x?: number; y?: number; size?: number; color?: string; refresh?: 'full' | 'partial' }
  | { cmd: 'clear'; color?: string; refresh?: 'full' | 'partial' }
  | { cmd: 'refresh'; mode?: 'full' | 'partial' }
  | { cmd: 'sleep' | 'wake' };

export type DeviceCommand = MotorCommand | EpaperCommand | ({ cmd: string } & Record<string, unknown>);

export function normalizeDeviceType(value: unknown): DeviceType {
  return value === 'motor' || value === 'epaper' ? value : 'unknown';
}

export function statusDeviceType(status?: DeviceStatus | null): DeviceType {
  return normalizeDeviceType(status?.device_type ?? status?.type);
}

export function normalizeMotorState(value: unknown): MotorState {
  return value === 'stopped' || value === 'ramping' || value === 'running' || value === 'braking' || value === 'coasting'
    ? value
    : 'unknown';
}

export function normalizeMotorDirection(value: unknown): MotorDirection {
  return value === 'reverse' || value === 'backward' ? 'reverse' : 'forward';
}

export function normalizeEpaperPanelType(value: unknown): EpaperPanelType {
  return value === 'mono' || value === 'color' ? value : 'unknown';
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
