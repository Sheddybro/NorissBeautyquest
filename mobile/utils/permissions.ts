export type PermissionAccount = {
  role?: string;
  allowed_operations?: string[];
};

export function canPerform(account: PermissionAccount | null | undefined, operation: string) {
  return account?.role === 'owner' || account?.allowed_operations?.includes(operation) === true;
}