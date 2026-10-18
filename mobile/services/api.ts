/** Centralized HTTP client. Transaction request bodies and idempotency IDs are owned by callers. */
export function normalizeApiBaseUrl(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const withoutTrailingSlash = raw.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(withoutTrailingSlash)) return withoutTrailingSlash;
  if (withoutTrailingSlash.startsWith('//')) return `https:${withoutTrailingSlash}`;
  return `https://${withoutTrailingSlash}`;
}

export function getApiConfigStatus(value: string = process.env.EXPO_PUBLIC_API_URL || '') {
  const base = normalizeApiBaseUrl(value);
  if (!base) {
    return { configured: false, base: '', message: 'Set EXPO_PUBLIC_API_URL to your Django server, e.g. http://localhost:8000.' };
  }
  try {
    const parsed = new URL(base);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return { configured: false, base, message: 'API URL must use http:// or https://.' };
    }
    return { configured: true, base, message: 'Ready to connect.' };
  } catch {
    return { configured: false, base, message: 'EXPO_PUBLIC_API_URL is not a valid URL.' };
  }
}

export const API_BASE = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL || '');

export class ApiError extends Error {
  constructor(message: string, readonly connectionFailure = false, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiCall(path: string, auth: string, body?: object): Promise<any> {
  if (!getApiConfigStatus(API_BASE).configured) {
    if (__DEV__) console.warn('[api] EXPO_PUBLIC_API_URL is not configured');
    throw new ApiError("Unable to connect. We couldn't reach Noriss Beautyquest. Check your internet connection and try again.", true);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error: any) {
    if (__DEV__) console.warn('[api] request failed:', API_BASE + path, error);
    const message = error?.name === 'AbortError'
      ? 'Server did not respond within 12 seconds. Check your connection and try again.'
      : "Unable to connect. We couldn't reach Noriss Beautyquest. Check your internet connection and try again.";
    throw new ApiError(message, true);
  } finally {
    clearTimeout(timeout);
  }
  // Successful no-content responses are valid; never parse them as JSON.
  if (response.status === 204 || response.status === 205) return null;
  let raw: string;
  try { raw = await response.text(); }
  catch { throw new ApiError('Could not read the server response. Please try again.', true, response.status); }
  let data: any = null;
  if (raw.trim()) {
    try { data = JSON.parse(raw); }
    catch {
      if (__DEV__) console.warn('[api] response was not valid JSON:', API_BASE + path);
      if (!response.ok) {
        throw new ApiError(response.status === 401 ? 'Session expired. Sign in again.' :
          response.status === 403 ? 'You do not have permission to perform this action.' :
          response.status === 429 ? 'Too many requests. Please wait and try again.' :
          response.status >= 500 ? 'The server is temporarily unavailable. Please try again.' :
          'Server request failed (' + response.status + ').', false, response.status);
      }
      throw new ApiError('The server returned an unexpected response. Please try again or contact support.', false, response.status);
    }
  }
  if (!response.ok) {
    // DRF/Django errors may use error, detail, message, or field-specific validation errors.
    const candidate = data?.error ?? data?.detail ?? data?.message;
    const validation = data && typeof data === 'object' && !Array.isArray(data)
      ? Object.entries(data).filter(([key]) => !['error', 'detail', 'message'].includes(key))
          .flatMap(([field, value]) => {
            const entries = Array.isArray(value) ? value : [value];
            return entries.filter((entry) => typeof entry === 'string').map((entry) => `${field}: ${entry}`);
          }).slice(0, 3).join('\n')
      : '';
    // Explicit Django/DRF messages and field errors take precedence over HTTP fallbacks.
    // Keep this as a separate expression: mixing `||` with a ternary without
    // parentheses causes the status fallback to overwrite useful validation text.
    const fallback = response.status === 401 ? 'Session expired. Sign in again.' :
      response.status === 403 ? 'You do not have permission to perform this action.' :
      response.status === 429 ? 'Too many requests. Please wait and try again.' :
      response.status >= 500 ? 'The server is temporarily unavailable. Please try again.' :
      'Server request failed (' + response.status + ').';
    const message = (typeof candidate === 'string' && candidate.trim()) || validation || fallback;
    throw new ApiError(message, false, response.status);
  }
  return data;
}
