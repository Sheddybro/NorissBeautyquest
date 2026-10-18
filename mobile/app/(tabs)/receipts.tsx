import { pendingOperationKey } from '../../utils/pendingKeys';
import { useFocusEffect } from 'expo-router';
import { makeRequestId } from '../../utils/requestId';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as deviceStorage from '../../services/deviceStorage';
import { ScreenFrame } from '../../components/ScreenFrame';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { apiCall } from '../../services/api';
import { getSession } from '../../services/session';
import { elevation, palette } from '../../theme/tokens';
import { formatNaira } from '../../utils/money';
import { canPerform } from '../../utils/permissions';


type Receipt = {
  id: string;
  reference?: string;
  party?: string;
  payment?: string;
  total?: number;
  created?: string;
  lines?: Array<{ id?: string; name?: string; quantity?: number; remaining?: number; unit_amount?: number }>;
};

type RefundPayload = {
  kind: 'refund';
  request_id: string;
  movement_id: string;
  quantity: number;
  restock: boolean;
  reason: string;
  payment: string;
  created: string;
};



export default function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refundInFlight, setRefundInFlight] = useState<Record<string, boolean>>({});
  const [pendingRefunds, setPendingRefunds] = useState<Record<string, RefundPayload>>({});
  const [storageKey, setStorageKey] = useState('');
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});
  const [restockByLine, setRestockByLine] = useState<Record<string, boolean>>({});
  const [reasonByLine, setReasonByLine] = useState<Record<string, string>>({});
  const [canRefund, setCanRefund] = useState(false);
  const [expandedReceipts, setExpandedReceipts] = useState<Record<string, boolean>>({});
  const refundLock = useRef(false);
  // Keep pending refund UI isolated to the authenticated account, even after switching users.
  const accountKeyRef = useRef('');

  useFocusEffect(React.useCallback(() => {
    let active = true;
    // Every return to this tab starts a fresh request. Keep existing form/cart state.
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const { token, username } = await getSession();
        if (!token) {
          if (active) {
            accountKeyRef.current = '';
            setReceipts([]);
            setCanRefund(false);
            setPendingRefunds({});
            setStorageKey('');
            setLoading(false);
          }
          return;
        }

        const [data, me] = await Promise.all([
          apiCall('/api/v1/receipts/', token),
          apiCall('/api/v1/me/', token),
        ]);
        const key = pendingOperationKey('refunds', me?.account);
        const savedRefunds = key ? await deviceStorage.getItemAsync(key) : null;
        if (!active) return;
        setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
        setCanRefund(canPerform(me?.account, 'refund'));
        if (accountKeyRef.current !== key) {
          accountKeyRef.current = key;
          setPendingRefunds({});
          setRefundQuantities({});
          setRestockByLine({});
          setReasonByLine({});
        }
        setStorageKey(key);
        if (savedRefunds) {
          try {
            const saved = JSON.parse(savedRefunds) as Record<string, RefundPayload>;
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) setPendingRefunds(saved);
          } catch {
            if (key) await deviceStorage.deleteItemAsync(key);
          }
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Unable to load receipts.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []));

  const filteredReceipts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return receipts;
    return receipts.filter((receipt) => {
      const reference = receipt.reference || '';
      const customer = receipt.party || '';
      const matchProduct = Array.isArray(receipt.lines)
        ? receipt.lines.some((line) => (line.name || '').toLowerCase().includes(term))
        : false;
      return reference.toLowerCase().includes(term) || customer.toLowerCase().includes(term) || matchProduct;
    });
  }, [receipts, searchTerm]);

  const refreshReceipts = async () => {
    const { token } = await getSession();
    if (!token) return;
    const data = await apiCall('/api/v1/receipts/', token);
    setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
  };

  const handleRefund = async (
    receipt: Receipt,
    line: { id?: string; name?: string; remaining?: number; quantity?: number; unit_amount?: number },
    quantity: number,
    reason: string,
    restock: boolean,
  ) => {
    if (!line?.id || refundLock.current) return;
    if (!canRefund) { setError('Your account is not authorized to process refunds.'); return; }
    const remaining = Number(line.remaining ?? line.quantity ?? 0);
    const existing = pendingRefunds[String(line.id)];
    const refundQty = existing?.quantity ?? quantity;
    if (!Number.isSafeInteger(refundQty) || refundQty <= 0 || (!existing && refundQty > remaining)) {
      setError('There are no remaining units to refund on this line.');
      return;
    }

    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to process a refund.');
      return;
    }

    refundLock.current = true;
    setRefundInFlight((current) => ({ ...current, [String(line.id)]: true }));
    setError('');
    setNotice('');

    try {
      const payload: RefundPayload = existing ?? {
        kind: 'refund',
        request_id: makeRequestId(),
        movement_id: String(line.id),
        quantity: refundQty,
        restock,
        reason: reason.trim() || 'Customer return',
        payment: receipt.payment || 'Cash',
        created: new Date().toISOString(),
      };

      if (!existing) {
        if (!storageKey) throw new Error('Unable to securely prepare refund recovery. Sign in again and retry.');
        const next = { ...pendingRefunds, [String(line.id)]: payload };
        await deviceStorage.setItemAsync(storageKey, JSON.stringify(next));
        setPendingRefunds(next);
      }

      await apiCall('/api/v1/refunds/', token, payload);

      const remainingPending = { ...pendingRefunds };
      delete remainingPending[String(line.id)];
      if (storageKey) {
        if (Object.keys(remainingPending).length) await deviceStorage.setItemAsync(storageKey, JSON.stringify(remainingPending));
        else await deviceStorage.deleteItemAsync(storageKey);
      }
      setPendingRefunds(remainingPending);

      setReceipts((current) => current.map((item) => item.id === receipt.id ? {
        ...item,
        lines: item.lines?.map((receiptLine) => receiptLine.id === line.id
          ? { ...receiptLine, remaining: Math.max(0, Number(receiptLine.remaining ?? receiptLine.quantity ?? 0) - refundQty) }
          : receiptLine),
      } : item));
      try {
        await refreshReceipts();
      } catch {
        setError('Refund recorded. Receipt quantities could not refresh; reload the list to see the latest balance.');
      }
      setNotice(`Refund recorded for ${line.name || 'item'} (${refundQty} unit${refundQty === 1 ? '' : 's'}).`);
    } catch (err: any) {
      setError(err?.message || 'Unable to process the refund.');
      if (!existing) setNotice('The refund request was saved securely. Retry will reuse the same request.');
    } finally {
      refundLock.current = false;
      setRefundInFlight((current) => ({ ...current, [String(line.id)]: false }));
    }
  };

  return (
    <ScreenFrame title="Receipts" eyebrow="EVERY PURCHASE, ACCOUNTED FOR" subtitle="Find completed sales and open a receipt whenever you need it.">
      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={palette.primary} /><Text style={styles.loadingText}>Loading receipts…</Text></View>
      ) : null}
      {!loading && error ? <FeedbackBanner kind="error" message={error} onDismiss={() => setError('')} /> : null}
      {!loading && notice ? <FeedbackBanner kind="info" message={notice} onDismiss={() => setNotice('')} /> : null}
      {!loading ? (
        <View style={styles.list}>
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search by receipt or customer"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {filteredReceipts.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No matching receipt activity has been recorded.</Text></View> : filteredReceipts.map((receipt) => (
            <View key={receipt.id} style={styles.item}>
              <View style={styles.row}>
                <Text style={styles.reference}>{receipt.reference || 'Receipt'}</Text>
                <Text style={styles.amount}>{formatNaira(Number(receipt.total ?? 0))}</Text>
              </View>
              <Text style={styles.meta}>{receipt.party || 'Walk-in customer'}</Text>
              <Text style={styles.meta}>{receipt.payment || 'Cash'} • {receipt.created ? new Date(receipt.created).toLocaleString() : 'recent'}</Text>
              {Array.isArray(receipt.lines) && receipt.lines.length > 0 ? (
                <>
                {receipt.lines.length > 3 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${expandedReceipts[receipt.id] ? 'Show fewer' : 'Show all'} items for ${receipt.reference || 'receipt'}`}
                    style={styles.expandButton}
                    onPress={() => setExpandedReceipts((current) => ({ ...current, [receipt.id]: !current[receipt.id] }))}>
                    <Text style={styles.expandText}>{expandedReceipts[receipt.id] ? 'Show fewer items' : `Show all ${receipt.lines.length} items`}</Text>
                  </Pressable>
                ) : null}
                <View style={styles.linesBox}>
                  {(expandedReceipts[receipt.id] ? receipt.lines : receipt.lines.slice(0, 3)).map((line, index) => {
                    const lineId = String(line.id || '');
                    const remaining = Number(line.remaining ?? line.quantity ?? 0);
                    const pending = pendingRefunds[lineId];
                    const refundable = canRefund && (remaining > 0 || Boolean(pending));
                    const selectedQuantity = Math.min(refundQuantities[lineId] ?? 1, remaining);
                    const restock = restockByLine[lineId] ?? true;
                    return (
                      <View key={`${receipt.id}-${line.id || index}`} style={styles.lineRow}>
                        <View style={styles.lineDetails}>
                          <Text style={styles.lineItem}>
                            {line.name || 'Product'} • Qty {line.quantity ?? 0} • {formatNaira(Number(line.unit_amount ?? 0))}
                            {remaining > 0 ? ` • remaining ${remaining}` : ' • refunded'}
                          </Text>
                          {refundable && !pending ? (
                            <>
                              <View style={styles.quantityControls}>
                                <Pressable
                                  accessibilityLabel="Decrease refund quantity"
                                  style={styles.quantityButton}
                                  onPress={() => setRefundQuantities((current) => ({ ...current, [lineId]: Math.max(1, selectedQuantity - 1) }))}
                                  disabled={selectedQuantity <= 1}
                                ><Text style={styles.quantityButtonText}>-</Text></Pressable>
                                <Text style={styles.quantityText}>Refund {selectedQuantity}</Text>
                                <Pressable
                                  accessibilityLabel="Increase refund quantity"
                                  style={styles.quantityButton}
                                  onPress={() => setRefundQuantities((current) => ({ ...current, [lineId]: Math.min(remaining, selectedQuantity + 1) }))}
                                  disabled={selectedQuantity >= remaining}
                                ><Text style={styles.quantityButtonText}>+</Text></Pressable>
                              </View>
                              <TextInput
                                value={reasonByLine[lineId] ?? 'Customer return'}
                                onChangeText={(value) => setReasonByLine((current) => ({ ...current, [lineId]: value }))}
                                placeholder="Refund reason"
                                style={styles.reasonInput}
                                maxLength={200}
                              />
                              <Pressable
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: restock }}
                                style={styles.restockOption}
                                onPress={() => setRestockByLine((current) => ({ ...current, [lineId]: !restock }))}
                              >
                                <View style={[styles.permissionCheck, restock && styles.permissionCheckSelected]}>
                                  <Text style={styles.permissionCheckText}>{restock ? '✓' : ''}</Text>
                                </View>
                                <Text style={styles.restockText}>Restock returned items</Text>
                              </Pressable>
                            </>
                          ) : null}
                        </View>
                        {refundable ? (
                          <Pressable
                            style={[styles.refundButton, refundInFlight[lineId] && styles.refundButtonBusy]}
                            onPress={() => handleRefund(receipt, line, selectedQuantity, reasonByLine[lineId] ?? 'Customer return', restock)}
                            disabled={Boolean(refundInFlight[lineId]) || Object.values(refundInFlight).some(Boolean)}
                          >
                            <Text style={styles.refundButtonText}>
                              {refundInFlight[lineId] ? 'Refunding…' : pending ? `Retry ${pending.quantity}` : `Refund ${selectedQuantity}`}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                </>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  expandButton: { paddingVertical: 10, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  expandText: { color: palette.primary, fontWeight: '800', fontSize: 13 },
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
  list: {
    marginTop: 12,
  },
  searchInput: {backgroundColor: palette.surface, color: palette.text, borderRadius: 15, minHeight: 52, paddingHorizontal: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 12},
  item: {backgroundColor: palette.surface, borderRadius: 14, padding: 17, borderWidth: 1, borderColor: palette.border, marginBottom: 12, ...elevation.card},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reference: {
    color: palette.text,
    fontWeight: '800',
    fontSize: 15,
  },
  amount: {
    color: palette.primary,
    fontWeight: '800',
  },
  meta: {
    color: palette.muted,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 20,
  },
  linesBox: {backgroundColor: '#F8F9FE', borderRadius: 16, padding: 13, marginTop: 12, borderWidth: 1, borderColor: palette.border},
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  lineDetails: {
    flex: 1,
  },
  lineItem: {
    color: palette.text,
    fontSize: 12,
    flex: 1,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  quantityButton: {width: 42, height: 42, borderRadius: 12, backgroundColor: palette.primarySoft, justifyContent: 'center', alignItems: 'center'},
  quantityButtonText: {
    color: '#286343',
    fontSize: 18,
    fontWeight: '800',
  },
  quantityText: {
    minWidth: 72,
    textAlign: 'center',
    color: palette.text,
    fontWeight: '700',
    fontSize: 12,
  },
  reasonInput: {backgroundColor: '#fff', borderRadius: 13, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 13, paddingVertical: 12, minHeight: 48, color: palette.text},
  restockOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  permissionCheck: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
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
    fontSize: 12,
    lineHeight: 14,
  },
  restockText: {
    color: palette.muted,
    fontSize: 12,
  },
  refundButton: {
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  refundButtonBusy: {
    opacity: 0.7,
  },
  refundButtonText: {
    color: '#9a4d00',
    fontWeight: '700',
    fontSize: 11,
  },
  empty: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#edf0f7',
    padding: 20,
  },
  emptyText: {
    color: palette.muted,
    lineHeight: 22,
    textAlign: 'center',
  },
});
