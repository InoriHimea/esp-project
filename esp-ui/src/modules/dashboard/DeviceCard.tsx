import { useNavigate } from 'react-router-dom';
import { Cpu } from 'lucide-react';
import type { DeviceStatus } from '../../ws/useDeviceWs';

interface DeviceCardProps {
  deviceId: string;
  status: DeviceStatus;
}

const STATE_LABELS: Record<DeviceStatus['state'], string> = {
  running: '运行中',
  stopped: '已停止',
  braking: '制动中',
  coasting: '惯性滑行',
};

const DIRECTION_LABELS: Record<DeviceStatus['direction'], string> = {
  forward: '正转',
  backward: '反转',
};

export default function DeviceCard({ deviceId, status }: DeviceCardProps) {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/motor/${deviceId}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          navigate(`/motor/${deviceId}`);
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
      {/* 顶部：状态指示灯 + 设备 ID */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]"
            aria-label="在线"
          />
          <span className="text-xs text-gray-400 font-mono">{deviceId}</span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-400">
          <Cpu size={18} />
          <span className="text-xs text-gray-400 capitalize">{status.device_type}</span>
        </div>
      </div>

      {/* 关键指标 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">速度</p>
          <p className="text-lg font-bold text-white leading-none">{status.speed}</p>
          <p className="text-xs text-gray-500 mt-0.5">RPM</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">方向</p>
          <p className="text-sm font-semibold text-blue-300 leading-none mt-1">
            {DIRECTION_LABELS[status.direction]}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">状态</p>
          <p
            className={[
              'text-sm font-semibold leading-none mt-1',
              status.state === 'running' ? 'text-green-400' : '',
              status.state === 'stopped' ? 'text-gray-400' : '',
              status.state === 'braking' ? 'text-yellow-400' : '',
              status.state === 'coasting' ? 'text-cyan-400' : '',
            ].join(' ')}
          >
            {STATE_LABELS[status.state]}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-3 text-right font-mono">{status.ip}</p>
    </div>
  );
}
