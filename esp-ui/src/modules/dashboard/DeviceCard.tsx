import { useNavigate } from 'react-router-dom';
import { Cpu, Monitor, HelpCircle } from 'lucide-react';
import type { DeviceStatus } from '../../types/devices';
import {
  normalizeDeviceType,
  normalizeEpaperPanelType,
  normalizeMotorDirection,
  normalizeMotorState,
  numberValue,
  stringValue,
} from '../../types/devices';

interface DeviceCardProps {
  deviceId: string;
  status: DeviceStatus;
}

const MOTOR_STATE_LABELS: Record<string, string> = {
  running: '运行中',
  stopped: '已停止',
  ramping: '加减速',
  braking: '制动中',
  coasting: '惯性滑行',
  unknown: '未知',
};

const DIRECTION_LABELS: Record<string, string> = {
  forward: '正转',
  reverse: '反转',
};

const EPAPER_STATE_LABELS: Record<string, string> = {
  idle: '空闲',
  rendering: '渲染中',
  refreshing: '刷新中',
  sleeping: '休眠',
  error: '错误',
  unknown: '未知',
};

function deviceRoute(deviceId: string, status: DeviceStatus): string {
  const type = normalizeDeviceType(status.device_type ?? status.type);
  if (type === 'motor') return `/motor/${deviceId}`;
  if (type === 'epaper') return `/epaper/${deviceId}`;
  return `/debug/${deviceId}`;
}

function TypeIcon({ status }: { status: DeviceStatus }) {
  const type = normalizeDeviceType(status.device_type ?? status.type);
  if (type === 'epaper') return <Monitor size={18} />;
  if (type === 'motor') return <Cpu size={18} />;
  return <HelpCircle size={18} />;
}

function Metric({ label, value, sub, className = 'text-white' }: { label: string; value: string | number; sub?: string; className?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-semibold leading-none mt-1 ${className}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function MotorSummary({ status }: { status: DeviceStatus }) {
  const state = normalizeMotorState(status.state);
  const direction = normalizeMotorDirection(status.direction);
  const speed = numberValue(status.speed);

  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric label="速度" value={speed} sub="PWM" className="text-white text-lg" />
      <Metric label="方向" value={DIRECTION_LABELS[direction]} className="text-blue-300" />
      <Metric
        label="状态"
        value={MOTOR_STATE_LABELS[state]}
        className={[
          state === 'running' ? 'text-green-400' : '',
          state === 'stopped' ? 'text-gray-400' : '',
          state === 'ramping' ? 'text-yellow-400' : '',
          state === 'braking' ? 'text-yellow-400' : '',
          state === 'coasting' ? 'text-cyan-400' : '',
          state === 'unknown' ? 'text-gray-500' : '',
        ].join(' ')}
      />
    </div>
  );
}

function EpaperSummary({ status }: { status: DeviceStatus }) {
  const panelType = normalizeEpaperPanelType(status.panel_type);
  const width = numberValue(status.width);
  const height = numberValue(status.height);
  const busy = status.busy === true;
  const state = stringValue(status.state, busy ? 'refreshing' : 'idle');
  const palette = Array.isArray(status.palette) ? status.palette.join('/') : panelType === 'color' ? 'color' : 'bw';

  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric label="屏幕" value={panelType === 'color' ? '彩色' : panelType === 'mono' ? '黑白' : '未知'} sub={palette} className="text-indigo-300" />
      <Metric label="分辨率" value={width && height ? `${width}×${height}` : '—'} className="text-white" />
      <Metric
        label="状态"
        value={EPAPER_STATE_LABELS[state] ?? state}
        className={busy ? 'text-yellow-400' : state === 'error' ? 'text-red-400' : 'text-green-400'}
      />
    </div>
  );
}

function UnknownSummary({ status }: { status: DeviceStatus }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric label="类型" value={stringValue(status.device_type ?? status.type, 'unknown')} className="text-gray-300" />
      <Metric label="状态" value={stringValue(status.state, '未知')} className="text-gray-300" />
      <Metric label="调试" value="Debug" className="text-blue-300" />
    </div>
  );
}

export default function DeviceCard({ deviceId, status }: DeviceCardProps) {
  const navigate = useNavigate();
  const route = deviceRoute(deviceId, status);
  const type = normalizeDeviceType(status.device_type ?? status.type);
  const ip = stringValue(status.ip);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(route)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          navigate(route);
        }
      }}
      className="
        bg-gray-800 border border-gray-700 rounded-2xl p-5
        cursor-pointer select-none
        hover:border-blue-500
        active:scale-[0.98]
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-blue-500
      "
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]"
            aria-label="在线"
          />
          <span className="text-xs text-gray-400 font-mono">{deviceId}</span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-400">
          <TypeIcon status={status} />
          <span className="text-xs text-gray-400 capitalize">{type}</span>
        </div>
      </div>

      {type === 'motor' ? <MotorSummary status={status} /> : type === 'epaper' ? <EpaperSummary status={status} /> : <UnknownSummary status={status} />}

      <p className="text-xs text-gray-600 mt-3 text-right font-mono">{ip || '—'}</p>
    </div>
  );
}
