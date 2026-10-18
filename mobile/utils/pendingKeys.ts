/** Isolate retry payloads by server-verified store and user, never username alone. */
export type ScopedAccount = { store_id?: string | number; user_id?: string | number; key?: string } | null | undefined;
export function pendingOperationKey(kind: 'checkout' | 'purchase' | 'expense' | 'refunds', account: ScopedAccount): string {
  const scope = account?.key || (account?.store_id != null && account?.user_id != null
    ? `${account.store_id}:${account.user_id}` : '');
  if (!scope || !/^[A-Za-z0-9:_-]+$/.test(scope)) return '';
  return `noriss_pending_${kind}_${scope}`;
}
