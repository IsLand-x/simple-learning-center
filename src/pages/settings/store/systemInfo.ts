import { serverRequest } from '../../../util/api/serverApi';

export interface SystemInfo {
  hostname: string;
  operatingSystem: string;
  architecture: string;
  cpu: { model: string | null; logicalCores: number };
  memory: { totalBytes: number; freeBytes: number };
  nodeVersion: string;
  addresses: { name: string; address: string; family: string }[];
}

export async function requestSystemInfo(signal: AbortSignal): Promise<SystemInfo> {
  const response = await serverRequest('/api/settings/system-info', { signal });
  return response.json() as Promise<SystemInfo>;
}
