import * as Crypto from 'expo-crypto';

/** Cryptographically strong IDs for safely retryable financial operations. */
export function makeRequestId(): string {
  return Crypto.randomUUID();
}
