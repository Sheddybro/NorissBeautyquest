import * as deviceStorage from './deviceStorage';

export const SESSION_TOKEN_KEY = 'noriss_mobile_token';
export const SESSION_USER_KEY = 'noriss_mobile_user';

export async function saveSession(token: string, username?: string) {
  await deviceStorage.setItemAsync(SESSION_TOKEN_KEY, token);
  if (username) {
    await deviceStorage.setItemAsync(SESSION_USER_KEY, username);
  }
}

export async function getSession() {
  const [token, username] = await Promise.all([
    deviceStorage.getItemAsync(SESSION_TOKEN_KEY),
    deviceStorage.getItemAsync(SESSION_USER_KEY),
  ]);

  return {
    token: token || '',
    username: username || '',
  };
}

export async function clearSession() {
  await Promise.all([
    deviceStorage.deleteItemAsync(SESSION_TOKEN_KEY),
    deviceStorage.deleteItemAsync(SESSION_USER_KEY),
  ]);
}
