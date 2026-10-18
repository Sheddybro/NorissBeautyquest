/** Strictly keep the embedded browser on the configured Django origin. */
export function getSiteOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol === 'http:' && !isLocalDevelopmentHost(parsed.hostname)) return null;
    return parsed.origin;
  } catch { return null; }
}
function isLocalDevelopmentHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
}
export function isAllowedWebNavigation(url: string, origin: string | null): boolean {
  if (!origin) return false;
  try { const parsed = new URL(url); return parsed.origin === origin && (parsed.protocol === 'https:' || parsed.protocol === 'http:'); }
  catch { return false; }
}
export function shouldOpenExternally(url: string): boolean {
  try { const parsed = new URL(url); return ['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol); }
  catch { return false; }
}
