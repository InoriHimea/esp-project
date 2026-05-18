import { useEffect, useState } from 'react';
import { useDeviceWs } from '../../ws/useDeviceWs';
import { getDevices } from '../../api/devices';
import DeviceCard from './DeviceCard';
import type { DeviceRecord, DeviceStatus } from '../../types/devices';
import { statusDeviceType } from '../../types/devices';

function createPlaceholderStatus(device?: DeviceRecord): DeviceStatus {
  const status = device?.last_status ?? {};
  const deviceType = statusDeviceType(status) !== 'unknown' ? statusDeviceType(status) : statusDeviceType({ device_type: device?.type });

  return {
    ...status,
    device_type: deviceType,
    ip: status.ip ?? device?.ip ?? '',
    uptime_ms: status.uptime_ms ?? 0,
  };
}

export default function DashboardPage() {
  const deviceMap = useDeviceWs();
  const [initialDevices, setInitialDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDevices()
      .then((devices) => {
        setInitialDevices(devices);
      })
      .catch((err) => {
        console.error('Failed to load devices:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const allDeviceIds = new Set([
    ...initialDevices.map((d) => d.id),
    ...Array.from(deviceMap.keys()),
  ]);

  const devices = Array.from(allDeviceIds).map((id) => {
    const wsStatus = deviceMap.get(id);
    const initialDevice = initialDevices.find((d) => d.id === id);
    const status = wsStatus || createPlaceholderStatus(initialDevice);

    return [id, status] as [string, DeviceStatus];
  });

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-semibold text-white mb-6">设备总览</h1>
        <div className="flex items-center justify-center py-24 text-gray-500">
          <p className="text-base">加载中...</p>
        </div>
      </div>
    );
  }

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
