// Keep the CDN origin allowlist and immutable cache policy identical.
export function isVersionedAssetPath(path: string) {
  return /^\/assets\/[^/]+-[\w-]{8,}\.[\w.]+$/.test(path);
}
