import { mutatePersistedState } from './storage.mjs';
import { statusError } from './errors.mjs';

export const API_KEY_EXPORT_FORMAT = 'learning-center-api-keys';
export const API_KEY_EXPORT_VERSION = 1;

function requiredString(value, field, maxLength = 10_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw statusError(400, `${field} 不正确`);
  }
  return value.trim();
}

function optionalKey(value, field) {
  if (typeof value !== 'string' || value.length > 64 * 1024) {
    throw statusError(400, `${field} 不正确`);
  }
  return value.trim();
}

function validateHttpUrl(value, field) {
  const normalized = requiredString(value, field, 4_096).replace(/\/+$/, '');
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw statusError(400, `${field} 不正确`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw statusError(400, `${field} 只支持 HTTP 或 HTTPS`);
  }
  return normalized;
}

function validateModels(value, index) {
  if (!Array.isArray(value) || !value.length || value.length > 200) {
    throw statusError(400, `第 ${index + 1} 个模型配置的模型列表不正确`);
  }
  return Array.from(new Set(value.map((model) => (
    requiredString(model, `第 ${index + 1} 个模型名称`, 500)
  ))));
}

export function createApiKeyExport(persistedState) {
  const state = persistedState?.state;
  const openAIConfigs = Array.isArray(state?.openAIConfigs) ? state.openAIConfigs : [];
  const exportedConfigs = openAIConfigs.flatMap((config) => {
    if (!config || typeof config !== 'object' || typeof config.apiKey !== 'string' || !config.apiKey) return [];
    return [{
      id: config.id,
      name: config.name,
      baseUrl: config.baseUrl,
      models: config.models,
      apiKey: config.apiKey,
    }];
  });
  const jinaApiKey = typeof state?.webSearchConfig?.apiKey === 'string'
    ? state.webSearchConfig.apiKey
    : '';

  return {
    format: API_KEY_EXPORT_FORMAT,
    version: API_KEY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    openAIConfigs: exportedConfigs,
    webSearchConfig: jinaApiKey ? { provider: 'jina', apiKey: jinaApiKey } : null,
  };
}

export function parseApiKeyImport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw statusError(400, 'API Key 导入文件格式不正确');
  }
  if (value.format !== API_KEY_EXPORT_FORMAT || value.version !== API_KEY_EXPORT_VERSION) {
    throw statusError(400, '不支持的 API Key 导入文件');
  }
  if (!Array.isArray(value.openAIConfigs) || value.openAIConfigs.length > 100) {
    throw statusError(400, '模型 API Key 列表不正确');
  }

  const ids = new Set();
  const openAIConfigs = value.openAIConfigs.map((config, index) => {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw statusError(400, `第 ${index + 1} 个模型配置不正确`);
    }
    const id = requiredString(config.id, `第 ${index + 1} 个模型配置 ID`, 200);
    if (ids.has(id)) throw statusError(400, `模型配置 ID “${id}” 重复`);
    ids.add(id);
    return {
      id,
      name: requiredString(config.name, `第 ${index + 1} 个模型配置名称`, 200),
      baseUrl: validateHttpUrl(config.baseUrl, `第 ${index + 1} 个模型 API 地址`),
      models: validateModels(config.models, index),
      apiKey: optionalKey(config.apiKey, `第 ${index + 1} 个模型 API Key`),
    };
  });

  let webSearchConfig = null;
  if (value.webSearchConfig !== null && value.webSearchConfig !== undefined) {
    if (
      typeof value.webSearchConfig !== 'object'
      || Array.isArray(value.webSearchConfig)
      || value.webSearchConfig.provider !== 'jina'
    ) {
      throw statusError(400, '联网搜索 API Key 配置不正确');
    }
    webSearchConfig = {
      provider: 'jina',
      apiKey: optionalKey(value.webSearchConfig.apiKey, '联网搜索 API Key'),
    };
  }

  return { openAIConfigs, webSearchConfig };
}

export async function importApiKeys(imported) {
  return mutatePersistedState((persistedState) => {
    const state = persistedState.state;
    const existingConfigs = Array.isArray(state.openAIConfigs) ? state.openAIConfigs : [];
    const existingById = new Map(existingConfigs.map((config) => [config.id, config]));
    const timestamp = Date.now();
    let added = 0;
    let updated = 0;

    for (const config of imported.openAIConfigs) {
      const existing = existingById.get(config.id);
      if (existing) {
        existingById.set(config.id, {
          ...existing,
          apiKey: config.apiKey,
          updatedAt: timestamp,
        });
        updated += 1;
      } else {
        existingById.set(config.id, {
          ...config,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        added += 1;
      }
    }

    state.openAIConfigs = Array.from(existingById.values());
    if (imported.webSearchConfig) {
      state.webSearchConfig = {
        ...(state.webSearchConfig && typeof state.webSearchConfig === 'object'
          ? state.webSearchConfig
          : {}),
        ...imported.webSearchConfig,
      };
    }

    return {
      imported: {
        added,
        updated,
        webSearch: Boolean(imported.webSearchConfig),
      },
    };
  });
}
