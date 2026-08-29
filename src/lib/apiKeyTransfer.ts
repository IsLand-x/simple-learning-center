import { serverRequest } from './serverApi';

const MAX_API_KEY_IMPORT_BYTES = 1024 * 1024;

export interface ApiKeyImportResult {
  imported: {
    added: number;
    updated: number;
    webSearch: boolean;
  };
}

function exportFilename(response: Response) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] || `learning-center-api-keys-${new Date().toISOString().slice(0, 10)}.json`;
}

export async function downloadApiKeys() {
  const response = await serverRequest('/api/api-keys/export');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = exportFilename(response);
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function uploadApiKeys(file: File) {
  if (file.size > MAX_API_KEY_IMPORT_BYTES) {
    throw new Error('API Key 导入文件不能超过 1 MB');
  }
  const response = await serverRequest('/api/api-keys/import', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: await file.text(),
  });
  return response.json() as Promise<ApiKeyImportResult>;
}
