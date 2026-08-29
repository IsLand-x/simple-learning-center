const shortRevision = __APP_REVISION__.slice(0, 7);

export const appMetadata = Object.freeze({
  version: `v${__APP_VERSION__}+${shortRevision}`,
  updatedAt: __APP_UPDATED_AT__,
});

export function formatAppUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}
