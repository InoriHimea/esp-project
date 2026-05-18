import { apiGet, apiPost } from './client';
import type { DeviceCommand, DeviceRecord } from '../types/devices';

export const getDevices = (): Promise<DeviceRecord[]> => apiGet<DeviceRecord[]>('/devices');

export const sendDeviceCommand = (deviceId: string, command: DeviceCommand): Promise<{ status: string }> =>
  apiPost<{ status: string }>(`/devices/${deviceId}/command`, command);
