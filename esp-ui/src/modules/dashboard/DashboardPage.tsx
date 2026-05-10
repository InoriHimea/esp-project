import { useDeviceWs } from '../../ws/useDeviceWs';
import DeviceCard from './DeviceCard';

export default function DashboardPage() {
  const deviceMap = useDeviceWs();
  const devices = Array.from(deviceMap.entries());

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold text-white mb-6">设备总览</h1>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-12 h-12 mb-4 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-base">暂无设备在线</p>
          <p className="text-sm mt-1 opacity-60">等待设备连接中…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map(([deviceId, status]) => (
            <DeviceCard key={deviceId} deviceId={deviceId} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}
