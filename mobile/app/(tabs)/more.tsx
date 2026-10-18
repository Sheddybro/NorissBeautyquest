import { pendingOperationKey } from '../../utils/pendingKeys';
import { useFocusEffect } from 'expo-router';
import { makeRequestId } from '../../utils/requestId';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as deviceStorage from '../../services/deviceStorage';
import { ActionButton } from '../../components/ActionButton';
import { ScreenFrame } from '../../components/ScreenFrame';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { apiCall } from '../../services/api';
import { clearSession, getSession } from '../../services/session';
import { elevation, palette } from '../../theme/tokens';
import { formatNaira, parseNairaToKobo } from '../../utils/money';

type StaffMember = {
  id: number;
  username?: string;
  role?: string;
  permissions?: string[];
  is_owner?: boolean;
};

type RoleOption = 'staff' | 'cashier' | 'viewer';
type PaymentMethod = 'Cash' | 'Transfer' | 'POS card';
type Expense = { id: string; description: string; amount: number; payment: PaymentMethod; created: string };
type ExpensePayload = {
  kind: 'expense';
  request_id: string;
  description: string;
  amount: number;
  payment: PaymentMethod;
  created: string;
};
type OwnerReport = {
  metrics: {
    gross_sales: number;
    refunds: number;
    net_sales: number;
    cost_of_goods_sold: number;
    known_cost_gross_profit: number;
    expenses: number;
    estimated_operating_profit: number;
    unknown_cost_sales: number;
  };
};

const roleOptions: RoleOption[] = ['staff', 'cashier', 'viewer'];
const paymentOptions: PaymentMethod[] = ['Cash', 'Transfer', 'POS card'];
const permissionOptions = [
  { key: 'product', label: 'Create products' },
  { key: 'product_update', label: 'Edit products' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'purchase', label: 'Record purchases' },
  { key: 'refund', label: 'Process refunds' },
  { key: 'expense', label: 'Record expenses' },
  { key: 'reconcile', label: 'Reconcile payments' },
];

export default function MoreTab() {
  const [account, setAccount] = useState<{ username?: string; role?: string; store?: string; store_name?: string; allowed_operations?: string[] } | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [storeName, setStoreName] = useState('');
  const [storeSaving, setStoreSaving] = useState(false);
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<RoleOption>('staff');
  const [staffPermissions, setStaffPermissions] = useState<string[]>(['checkout']);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState<RoleOption>('staff');
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [staffSaving, setStaffSaving] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayment, setExpensePayment] = useState<PaymentMethod>('Cash');
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [pendingExpense, setPendingExpense] = useState<ExpensePayload | null>(null);
  const [expenseStorageKey, setExpenseStorageKey] = useState('');
  const [ownerReport, setOwnerReport] = useState<OwnerReport | null>(null);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManageExpenses = Boolean(account?.role === 'owner' || account?.allowed_operations?.includes('expense'));

  const loadExpenses = async (token: string) => {
    const result = await apiCall('/api/v1/expenses/', token);
    setExpenses(Array.isArray(result?.expenses) ? result.expenses : []);
  };

  const loadReport = async (token: string, from = reportFrom, to = reportTo) => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const parameters = query.toString();
    const suffix = parameters ? `?${parameters}` : '';
    const result = await apiCall(`/api/v1/reports/${suffix}`, token);
    setOwnerReport(result as OwnerReport);
  };


  const loadStaff = async (token: string) => {
    const details = await apiCall('/api/v1/owner/staff/', token);
    setStaff(Array.isArray(details?.members) ? details.members : []);
  };

  useFocusEffect(React.useCallback(() => {
    let active = true;
    // Every return to this tab starts a fresh request. Keep existing form/cart state.
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const { token, username } = await getSession();
        if (!token) {
          setLoading(false);
          return;
        }

        const me = await apiCall('/api/v1/me/', token);
        if (!active) return;
        const nextAccount = me?.account ?? null;
        setAccount(nextAccount);
        setStoreName(nextAccount?.store_name || nextAccount?.store || '');

        const savedExpenseKey = pendingOperationKey('expense', nextAccount);
        setExpenseStorageKey(savedExpenseKey);
        if (savedExpenseKey) {
          const savedExpense = await deviceStorage.getItemAsync(savedExpenseKey);
          if (savedExpense) {
            try {
              const payload = JSON.parse(savedExpense) as ExpensePayload;
              if (payload?.kind === 'expense' && payload.request_id && payload.amount > 0) {
                setPendingExpense(payload);
                setExpenseDescription(payload.description);
                setExpenseAmount(String(payload.amount / 100));
                setExpensePayment(payload.payment);
                setNotice('An expense is awaiting confirmation. Retry to safely confirm the same request.');
              }
            } catch {
              await deviceStorage.deleteItemAsync(savedExpenseKey);
            }
          }
        }

        if (nextAccount?.role === 'owner' || nextAccount?.allowed_operations?.includes('expense')) {
          await loadExpenses(token);
          if (!active) return;
        }

        if (nextAccount?.role === 'owner') {
          await loadStaff(token);
          await loadReport(token, '', '');
          if (!active) return;
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Unable to load profile.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []));

  const handleSaveStore = async () => {
    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to update the store.');
      return;
    }

    setStoreSaving(true);
    setError('');
    setNotice('');

    try {
      const result = await apiCall('/api/v1/owner/settings/', token, { name: storeName });
      setStoreName(result?.store_name || storeName);
      setNotice('Store name updated.');
      setAccount((current) => ({ ...(current ?? {}), store_name: result?.store_name || storeName, store: result?.store_name || storeName }));
    } catch (err: any) {
      setError(err?.message || 'Unable to update the store name.');
    } finally {
      setStoreSaving(false);
    }
  };

  const handleCreateStaff = async () => {
    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to create staff.');
      return;
    }

    if (!staffUsername.trim() || !staffPassword.trim()) {
      setError('Enter a username and password for the new team member.');
      return;
    }

    setStaffSaving(true);
    setError('');
    setNotice('');

    try {
      const result = await apiCall('/api/v1/owner/staff/', token, {
        action: 'create',
        username: staffUsername.trim(),
        password: staffPassword,
        role: staffRole,
        permissions: staffPermissions,
      });

      await loadStaff(token);
      setStaffUsername('');
      setStaffPassword('');
      setStaffRole('staff');
      setStaffPermissions(['checkout']);
      setNotice('Staff member created successfully.');
    } catch (err: any) {
      setError(err?.message || 'Unable to create the team member.');
    } finally {
      setStaffSaving(false);
    }
  };

  const beginEditStaff = (member: StaffMember) => {
    setEditingStaff(member);
    setEditRole(roleOptions.includes(member.role as RoleOption) ? member.role as RoleOption : 'staff');
    setEditPermissions(member.permissions || []);
    setError('');
    setNotice('');
  };

  const togglePermission = (permission: string, selected: string[], update: (next: string[]) => void) => {
    update(selected.includes(permission)
      ? selected.filter((value) => value !== permission)
      : [...selected, permission]);
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;
    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to update staff access.');
      return;
    }

    setStaffSaving(true);
    setError('');
    setNotice('');
    try {
      await apiCall('/api/v1/owner/staff/', token, {
        action: 'update',
        user_id: editingStaff.id,
        role: editRole,
        permissions: editPermissions,
      });
      await loadStaff(token);
      setEditingStaff(null);
      setNotice('Staff access updated.');
    } catch (err: any) {
      setError(err?.message || 'Unable to update staff access.');
    } finally {
      setStaffSaving(false);
    }
  };

  const handleRecordExpense = async () => {
    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to record an expense.');
      return;
    }

    if (!pendingExpense && !expenseDescription.trim()) {
      setError('Enter a description for the expense.');
      return;
    }
    const amountInKobo = pendingExpense?.amount ?? parseNairaToKobo(expenseAmount);
    if (!amountInKobo) {
      setError('Enter an expense amount greater than zero.');
      return;
    }

    setExpenseSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: ExpensePayload = pendingExpense ?? {
        kind: 'expense',
        request_id: makeRequestId(),
        description: expenseDescription.trim(),
        amount: amountInKobo,
        payment: expensePayment,
        created: new Date().toISOString(),
      };

      if (!pendingExpense) {
        if (!expenseStorageKey) throw new Error('Unable to securely prepare expense recovery. Sign in again and retry.');
        await deviceStorage.setItemAsync(expenseStorageKey, JSON.stringify(payload));
        setPendingExpense(payload);
      }

      await apiCall('/api/v1/expenses/', token, payload);
      if (expenseStorageKey) await deviceStorage.deleteItemAsync(expenseStorageKey);
      setPendingExpense(null);
      setExpenseDescription('');
      setExpenseAmount('');
      setExpensePayment('Cash');
      try {
        await loadExpenses(token);
      } catch {
        setError('Expense recorded. The history could not refresh; reload the workspace to see the latest list.');
      }
      setNotice('Expense recorded.');
    } catch (err: any) {
      setError(err?.message || 'Unable to record the expense.');
      if (err?.connectionFailure) {
        if (!pendingExpense) setNotice('The expense request was saved securely. Retry will reuse the same request.');
      } else {
        if (expenseStorageKey) await deviceStorage.deleteItemAsync(expenseStorageKey);
        setPendingExpense(null);
      }
    } finally {
      setExpenseSaving(false);
    }
  };

  const handleApplyReportDates = async () => {
    if (reportFrom && reportTo && reportFrom > reportTo) {
      setError('The report start date must not follow its end date.');
      return;
    }
    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to load reports.');
      return;
    }
    setReportLoading(true);
    setError('');
    try {
      await loadReport(token, reportFrom, reportTo);
    } catch (err: any) {
      setError(err?.message || 'Unable to load the owner report.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { token } = await getSession();
    try {
      if (token) {
        await apiCall('/api/v1/auth/logout/', token);
      }
    } catch (err) {
      console.warn('Logout request failed.', err);
    } finally {
      await clearSession();
      router.replace('/');
    }
  };

  return (
    <ScreenFrame title="Business settings" eyebrow="BUSINESS SETTINGS" subtitle="Update the visible shop identity and manage owner-level settings in-app.">
      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={palette.primary} /><Text style={styles.loadingText}>Loading workspace…</Text></View>
      ) : null}
      {!loading && error ? <FeedbackBanner kind="error" message={error} onDismiss={() => setError('')} /> : null}
      {!loading && notice ? <FeedbackBanner kind="info" message={notice} onDismiss={() => setNotice('')} /> : null}

      {!loading ? (
        <View style={styles.panelWrap}>
          <View style={styles.panel}>
            <Text style={styles.title}>Workspace controls</Text>
            <Text style={styles.text}>Store: {account?.store_name || account?.store || 'Noriss Beautyquest'}</Text>
            <Text style={styles.text}>User: {account?.username || 'owner'}</Text>
            <Text style={styles.text}>Role: {account?.role || 'owner'}</Text>
            <ActionButton label="Sign out" onPress={handleSignOut} />
          </View>

          {account?.role === 'owner' ? (
            <>
              <View style={styles.panel}>
                <Text style={styles.title}>Store settings</Text>
                <TextInput
                  value={storeName}
                  onChangeText={setStoreName}
                  style={styles.input}
                  placeholder="Store name"
                />
                <ActionButton label={storeSaving ? 'Saving…' : 'Save store name'} onPress={handleSaveStore} disabled={storeSaving} busy={storeSaving} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.title}>Add team member</Text>
                <TextInput
                  value={staffUsername}
                  onChangeText={setStaffUsername}
                  style={styles.input}
                  placeholder="Username"
                  autoCapitalize="none"
                />
                <TextInput
                  value={staffPassword}
                  onChangeText={setStaffPassword}
                  style={styles.input}
                  placeholder="Password"
                  secureTextEntry
                  autoCapitalize="none"
                />

                <View style={styles.roleRow}>
                  {roleOptions.map((role) => (
                    <Pressable
                      key={role}
                      accessibilityRole="button"
                      accessibilityState={{ selected: staffRole === role }}
                      style={[styles.roleOption, staffRole === role && styles.roleOptionSelected]}
                      onPress={() => setStaffRole(role)}
                    ><Text style={[styles.roleOptionText, staffRole === role && styles.roleOptionTextSelected]}>{role}</Text></Pressable>
                  ))}
                </View>

                <Text style={styles.permissionHeading}>Permissions</Text>
                <View style={styles.permissionList}>
                  {permissionOptions.map((permission) => {
                    const selected = staffPermissions.includes(permission.key);
                    return (
                      <Pressable
                        key={permission.key}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        style={styles.permissionOption}
                        onPress={() => togglePermission(permission.key, staffPermissions, setStaffPermissions)}
                      >
                        <View style={[styles.permissionCheck, selected && styles.permissionCheckSelected]}>
                          <Text style={styles.permissionCheckText}>{selected ? '✓' : ''}</Text>
                        </View>
                        <Text style={styles.permissionText}>{permission.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ActionButton label={staffSaving ? 'Creating…' : 'Create staff'} onPress={handleCreateStaff} disabled={staffSaving} busy={staffSaving} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.title}>Team access</Text>
                {staff.length === 0 ? <Text style={styles.text}>No additional staff members found.</Text> : staff.map((member) => (
                  <View key={member.id}>
                    <View style={styles.staffRow}>
                      <View style={styles.staffInfo}>
                        <Text style={styles.staffName}>{member.username}</Text>
                        <Text style={styles.staffMeta}>{member.role}{member.permissions?.length ? ` · ${member.permissions.length} permissions` : ''}</Text>
                      </View>
                      {!member.is_owner ? (
                        <Pressable style={styles.editButton} onPress={() => beginEditStaff(member)}>
                          <Text style={styles.editButtonText}>Edit access</Text>
                        </Pressable>
                      ) : <Text style={styles.ownerLabel}>Owner</Text>}
                    </View>
                    {editingStaff?.id === member.id ? (
                      <View style={styles.editPanel}>
                        <Text style={styles.permissionHeading}>Role</Text>
                        <View style={styles.roleRow}>
                          {roleOptions.map((role) => (
                            <Pressable
                              key={role}
                              accessibilityRole="button"
                              accessibilityState={{ selected: editRole === role }}
                              style={[styles.roleOption, editRole === role && styles.roleOptionSelected]}
                              onPress={() => setEditRole(role)}
                            ><Text style={[styles.roleOptionText, editRole === role && styles.roleOptionTextSelected]}>{role}</Text></Pressable>
                          ))}
                        </View>
                        <Text style={styles.permissionHeading}>Permissions</Text>
                        <View style={styles.permissionList}>
                          {permissionOptions.map((permission) => {
                            const selected = editPermissions.includes(permission.key);
                            return (
                              <Pressable
                                key={permission.key}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selected }}
                                style={styles.permissionOption}
                                onPress={() => togglePermission(permission.key, editPermissions, setEditPermissions)}
                              >
                                <View style={[styles.permissionCheck, selected && styles.permissionCheckSelected]}>
                                  <Text style={styles.permissionCheckText}>{selected ? '✓' : ''}</Text>
                                </View>
                                <Text style={styles.permissionText}>{permission.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={styles.editActions}>
                          <Pressable style={styles.cancelButton} onPress={() => setEditingStaff(null)}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </Pressable>
                          <View style={styles.saveButtonWrap}>
                            <ActionButton label={staffSaving ? 'Saving…' : 'Save access'} onPress={handleUpdateStaff} disabled={staffSaving} busy={staffSaving} />
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {canManageExpenses ? (
            <View style={styles.panel}>
              <Text style={styles.title}>Expenses</Text>
              <TextInput
                value={expenseDescription}
                onChangeText={setExpenseDescription}
                style={styles.input}
                placeholder="Expense description"
                maxLength={150}
                editable={!pendingExpense}
              />
              <TextInput
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                style={styles.input}
                placeholder="Amount (₦)"
                keyboardType="decimal-pad"
                editable={!pendingExpense}
              />
              <View style={styles.paymentRow}>
                {paymentOptions.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: expensePayment === option }}
                    style={[styles.paymentOption, expensePayment === option && styles.paymentOptionSelected]}
                    onPress={() => setExpensePayment(option)}
                    disabled={Boolean(pendingExpense)}
                  >
                    <Text style={[styles.paymentOptionText, expensePayment === option && styles.paymentOptionTextSelected]}>{option}</Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton
                label={expenseSaving ? 'Recording…' : pendingExpense ? 'Retry expense confirmation' : 'Record expense'}
                onPress={handleRecordExpense}
                disabled={expenseSaving}
                busy={expenseSaving}
              />
              <Text style={styles.subheading}>Recent expenses</Text>
              {expenses.length === 0 ? <Text style={styles.text}>No expense activity has been recorded.</Text> : expenses.slice(0, 10).map((expense) => (
                <View key={expense.id} style={styles.expenseRow}>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseDescription}>{expense.description}</Text>
                    <Text style={styles.expenseMeta}>{expense.payment} · {new Date(expense.created).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })}</Text>
                  </View>
                  <Text style={styles.expenseAmount}>{formatNaira(expense.amount)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {account?.role === 'owner' ? (
            <View style={styles.panel}>
              <Text style={styles.title}>Profit report</Text>
              <Text style={styles.text}>Confirmed activity only. Gross profit and operating profit exclude sales with unknown purchase costs.</Text>
              <View style={styles.reportDateRow}>
                <TextInput
                  value={reportFrom}
                  onChangeText={setReportFrom}
                  style={[styles.input, styles.reportDateInput]}
                  placeholder="From (YYYY-MM-DD)"
                  autoCapitalize="none"
                  maxLength={10}
                />
                <TextInput
                  value={reportTo}
                  onChangeText={setReportTo}
                  style={[styles.input, styles.reportDateInput]}
                  placeholder="To (YYYY-MM-DD)"
                  autoCapitalize="none"
                  maxLength={10}
                />
              </View>
              <ActionButton
                label={reportLoading ? 'Loading report…' : 'Apply report dates'}
                onPress={handleApplyReportDates}
                disabled={reportLoading}
                busy={reportLoading}
              />
              {ownerReport ? (
                <View style={styles.reportMetrics}>
                  <View style={styles.reportRow}><Text style={styles.reportLabel}>Gross sales</Text><Text style={styles.reportValue}>{formatNaira(ownerReport.metrics.gross_sales)}</Text></View>
                  <View style={styles.reportRow}><Text style={styles.reportLabel}>Refunds</Text><Text style={styles.reportValue}>{formatNaira(ownerReport.metrics.refunds)}</Text></View>
                  <View style={styles.reportRow}><Text style={styles.reportLabel}>Net sales</Text><Text style={styles.reportValue}>{formatNaira(ownerReport.metrics.net_sales)}</Text></View>
                  <View style={styles.reportRow}><Text style={styles.reportLabel}>Cost of goods sold</Text><Text style={styles.reportValue}>{formatNaira(ownerReport.metrics.cost_of_goods_sold)}</Text></View>
                  <View style={styles.reportRow}><Text style={styles.reportLabel}>Known-cost gross profit</Text><Text style={styles.reportValue}>{formatNaira(ownerReport.metrics.known_cost_gross_profit)}</Text></View>
                  <View style={styles.reportRow}><Text style={styles.reportLabel}>Recorded expenses</Text><Text style={styles.reportValue}>{formatNaira(ownerReport.metrics.expenses)}</Text></View>
                  <View style={[styles.reportRow, styles.reportProfitRow]}><Text style={styles.reportProfitLabel}>Estimated operating profit</Text><Text style={styles.reportProfitValue}>{formatNaira(ownerReport.metrics.estimated_operating_profit)}</Text></View>
                  {ownerReport.metrics.unknown_cost_sales > 0 ? <Text style={styles.reportWarning}>{ownerReport.metrics.unknown_cost_sales} sale line(s) excluded from cost-based profit because purchase cost is unknown.</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    marginTop: 18,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#edf0f7',
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: palette.muted,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 16,
    color: palette.danger,
    fontWeight: '700',
  },
  noticeText: {
    marginTop: 16,
    color: '#0f766e',
    fontWeight: '700',
  },
  panelWrap: {
    marginTop: 12,
  },
  panel: {backgroundColor: palette.surface, borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: palette.border, ...elevation.card},
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  text: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 24,
  },
  input: {backgroundColor: '#F8F9FE', color: palette.text, borderRadius: 14, borderWidth: 1, borderColor: palette.border, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12},
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  paymentOption: {backgroundColor: '#F8F9FE', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, borderWidth: 1, borderColor: palette.border, justifyContent: 'center'},
  paymentOptionSelected: {
    backgroundColor: '#e7f2ec',
    borderColor: '#71a98a',
  },
  paymentOptionText: {
    color: palette.muted,
    fontWeight: '700',
  },
  paymentOptionTextSelected: {
    color: '#286343',
  },
  subheading: {
    color: palette.text,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 4,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#edf0f7',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    color: palette.text,
    fontWeight: '700',
  },
  expenseMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 3,
  },
  expenseAmount: {
    color: palette.primary,
    fontWeight: '800',
  },
  reportDateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reportDateInput: {
    flex: 1,
    minWidth: 0,
  },
  reportMetrics: {
    marginTop: 4,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: '#edf0f7',
  },
  reportLabel: {
    flex: 1,
    color: palette.muted,
    fontSize: 13,
  },
  reportValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  reportProfitRow: {
    borderTopColor: '#b7d2c2',
    borderTopWidth: 2,
    marginTop: 4,
  },
  reportProfitLabel: {
    flex: 1,
    color: '#286343',
    fontWeight: '800',
  },
  reportProfitValue: {
    color: '#286343',
    fontWeight: '900',
  },
  reportWarning: {
    marginTop: 8,
    color: '#8a5b18',
    fontSize: 12,
    lineHeight: 18,
  },
  roleOption: {backgroundColor: '#F8F9FE', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, borderWidth: 1, borderColor: palette.border, justifyContent: 'center'},
  roleOptionSelected: {
    backgroundColor: '#e7f2ec',
    borderColor: '#71a98a',
  },
  roleOptionText: {
    color: palette.muted,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  roleOptionTextSelected: {
    color: '#286343',
  },
  permissionHeading: {
    color: palette.text,
    fontWeight: '700',
    marginBottom: 8,
  },
  permissionList: {
    marginBottom: 8,
  },
  permissionOption: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permissionCheck: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  permissionCheckSelected: {
    backgroundColor: '#286343',
    borderColor: '#286343',
  },
  permissionCheckText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  permissionText: {
    color: palette.text,
    fontSize: 13,
  },
  staffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#edf0f7',
    marginTop: 10,
  },
  staffInfo: {
    flex: 1,
  },
  editButton: {
    backgroundColor: '#edf4ef',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  editButtonText: {
    color: '#286343',
    fontWeight: '700',
    fontSize: 12,
  },
  ownerLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  editPanel: {marginTop: 12, padding: 16, backgroundColor: '#F4F6FC', borderRadius: 12, borderWidth: 1, borderColor: palette.border},
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: palette.muted,
    fontWeight: '700',
  },
  saveButtonWrap: {
    flex: 1,
  },
  staffName: {
    color: palette.text,
    fontWeight: '700',
  },
  staffMeta: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
