/** Centralized HTTP client. Transaction request bodies and idempotency IDs are owned by callers. */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly connectionFailure = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiCall(path: string, auth: string, body?: object): Promise<any> {
  if (!API_BASE) {
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
  let data: any;
  try { data = await response.json(); }
  catch (error) {
    if (__DEV__) console.warn('[api] response was not valid JSON:', API_BASE + path, error);
    throw new ApiError("Unable to connect. We couldn't reach Noriss Beautyquest. Check your internet connection and try again.", true);
  }
  if (!response.ok) throw new Error(data.error || (response.status === 401
    ? 'Session expired. Sign in again.' : 'Server request failed (' + response.status + ').'));
  return data;
}
