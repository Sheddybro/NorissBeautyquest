import { pendingOperationKey } from '../../utils/pendingKeys';
import { useFocusEffect } from 'expo-router';
import { makeRequestId } from '../../utils/requestId';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as deviceStorage from '../../services/deviceStorage';
import { ActionButton } from '../../components/ActionButton';
import { ScreenFrame } from '../../components/ScreenFrame';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { apiCall } from '../../services/api';
import { getSession } from '../../services/session';
import { elevation, palette } from '../../theme/tokens';
import { formatNaira } from '../../utils/money';
import { canPerform } from '../../utils/permissions';

type Product = {
  id: string;
  name: string;
  price?: number;
  stock?: number;
  sellable?: number;
};

type PaymentMethod = 'Cash' | 'Transfer' | 'POS card';
type CheckoutPayload = {
  kind: 'checkout';
  request_id: string;
  party: string;
  payment: PaymentMethod;
  created: string;
  lines: Array<{ product_id: string; quantity: number; unit_amount: number }>;
};

const paymentOptions: PaymentMethod[] = ['Cash', 'Transfer', 'POS card'];


export default function SellTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [customer, setCustomer] = useState('Walk-in customer');
  const [payment, setPayment] = useState<PaymentMethod>('Cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingSale, setPendingSale] = useState<CheckoutPayload | null>(null);
  const [pendingStorageKey, setPendingStorageKey] = useState('');
  const [canCheckout, setCanCheckout] = useState(false);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    // Every return to this tab starts a fresh request. Keep existing form/cart state.
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const { token } = await getSession();
        if (!token) {
          setLoading(false);
          return;
        }

        const me = await apiCall('/api/v1/me/', token);
        const allowed = canPerform(me?.account, 'checkout');
        if (active) setCanCheckout(allowed);
        if (!allowed) return;
        const storageKey = pendingOperationKey('checkout', me?.account);
        const [data, savedCheckout] = await Promise.all([
          apiCall('/api/v1/products/', token),
          storageKey ? deviceStorage.getItemAsync(storageKey) : Promise.resolve(null),
        ]);
        if (!active) return;
        setProducts(Array.isArray(data?.products) ? data.products : []);
        setPendingStorageKey(storageKey);
        if (savedCheckout) {
          try {
            const payload = JSON.parse(savedCheckout) as CheckoutPayload;
            if (payload?.kind === 'checkout' && payload.request_id && Array.isArray(payload.lines) && payload.lines.length) {
              setPendingSale(payload);
              setCart(Object.fromEntries(payload.lines.map((line) => [line.product_id, line.quantity])));
              setCustomer(payload.party || 'Walk-in customer');
              setPayment(payload.payment || 'Cash');
              setNotice('A sale is awaiting confirmation. Retry to safely confirm the same checkout.');
            }
          } catch {
            if (storageKey) await deviceStorage.deleteItemAsync(storageKey);
          }
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Unable to load products for checkout.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []));

  const summary = useMemo(() => {
    const lines = products.filter((product) => cart[product.id]);
    const subtotal = lines.reduce((sum, product) => sum + (Number(product.price ?? 0) * (cart[product.id] ?? 0)), 0);
    return { lines, subtotal };
  }, [cart, products]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      const name = product.name || '';
      return name.toLowerCase().includes(term);
    });
  }, [products, searchTerm]);

  const updateCartItem = (productId: string, delta: number) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const stock = Number(product.sellable ?? product.stock ?? 0);
    const currentQty = cart[productId] ?? 0;
    const nextQty = currentQty + delta;

    if (nextQty <= 0) {
      setCart((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      return;
    }

    if (nextQty > stock) {
      setError(`Only ${stock} ${product.name} units are available.`);
      return;
    }

    setCart((current) => ({
      ...current,
      [productId]: nextQty,
    }));
    setError('');
    setNotice('');
  };

  const addToCart = (productId: string) => updateCartItem(productId, 1);

  const submitSale = async () => {
    if (!summary.lines.length && !pendingSale) {
      setError('Add at least one product to the cart before checking out.');
      return;
    }

    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to continue your checkout.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const payload: CheckoutPayload = pendingSale ?? {
        kind: 'checkout',
        request_id: makeRequestId(),
        party: customer || 'Walk-in customer',
        payment,
        created: new Date().toISOString(),
        lines: summary.lines.map((product) => ({
          product_id: product.id,
          quantity: cart[product.id] || 0,
          unit_amount: Number(product.price ?? 0),
        })),
      };

      if (!pendingSale) {
        if (!pendingStorageKey) throw new Error('Unable to securely prepare checkout recovery. Sign in again and retry.');
        await deviceStorage.setItemAsync(pendingStorageKey, JSON.stringify(payload));
        setPendingSale(payload);
      }

      const result = await apiCall('/api/v1/checkout/', token, payload);
      if (pendingStorageKey) await deviceStorage.deleteItemAsync(pendingStorageKey);
      setPendingSale(null);
      setCart({});
      setCustomer('Walk-in customer');
      setPayment('Cash');
      setNotice(result?.receipt ? `Sale completed. Receipt ${result.receipt}.` : 'Sale completed successfully.');
    } catch (err: any) {
      setError(err?.message || 'Checkout status is unknown. Retry to safely confirm the same sale.');
      if (!pendingSale) setNotice('The checkout has been saved securely. Retrying will reuse the same sale request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenFrame title="Sales" eyebrow="EVERY SALE, BEAUTIFULLY TRACKED" subtitle="Review transactions, check out a customer, and keep every sale in view.">
      {loading ? <View style={styles.loadingBox}><ActivityIndicator color={palette.primary} /><Text style={styles.loadingText}>Loading product list…</Text></View> : null}
      {!loading && error ? <FeedbackBanner kind="error" message={error} onDismiss={() => setError('')} /> : null}
      {!loading && !error && !canCheckout ? <Text style={styles.emptyText}>Your account does not have checkout access.</Text> : null}
      {!loading && notice ? <FeedbackBanner kind="info" message={notice} onDismiss={() => setNotice('')} /> : null}
      {!loading && canCheckout ? (
        <View style={styles.layout}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Products</Text>
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search products"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              value={customer}
              onChangeText={setCustomer}
              placeholder="Customer name"
              style={styles.input}
              editable={!pendingSale}
            />
            <View style={styles.paymentRow}>
              {paymentOptions.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.paymentChip, payment === option && styles.paymentChipSelected]}
                  onPress={() => setPayment(option)}
                  disabled={Boolean(pendingSale)}
                >
                  <Text style={[styles.paymentChipText, payment === option && styles.paymentChipTextSelected]}>{option}</Text>
                </Pressable>
              ))}
            </View>
            {filteredProducts.length === 0 ? <Text style={styles.emptyText}>No matching products are available.</Text> : filteredProducts.map((product) => (
              <View key={product.id} style={styles.productRow}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>{formatNaira(Number(product.price ?? 0))} • Stock {Number(product.sellable ?? product.stock ?? 0)}</Text>
                </View>
                <View style={styles.cartControls}>
                  <Pressable style={styles.qtyButton} onPress={() => updateCartItem(product.id, -1)} disabled={Boolean(pendingSale) || !(cart[product.id] ?? 0)}>
                    <Text style={styles.qtyButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{cart[product.id] ?? 0}</Text>
                  <Pressable style={styles.qtyButton} onPress={() => addToCart(product.id)} disabled={Boolean(pendingSale) || Number(product.sellable ?? product.stock ?? 0) <= (cart[product.id] ?? 0)}>
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.panelTitle}>Cart summary</Text>
            {summary.lines.length === 0 ? <Text style={styles.emptyText}>Select products to start the order.</Text> : summary.lines.map((product) => (
              <View key={product.id} style={styles.summaryRow}>
                <View style={styles.summaryProductInfo}>
                  <Text style={styles.summaryText}>{product.name}</Text>
                  <View style={styles.summaryCartControls}>
                    <Pressable style={styles.summaryQtyButton} onPress={() => updateCartItem(product.id, -1)} disabled={Boolean(pendingSale)}>
                      <Text style={styles.summaryQtyButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.summaryQtyValue}>{cart[product.id]}</Text>
                    <Pressable style={styles.summaryQtyButton} onPress={() => updateCartItem(product.id, 1)} disabled={Boolean(pendingSale)}>
                      <Text style={styles.summaryQtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.summaryText}>{formatNaira(Number(product.price ?? 0) * (cart[product.id] ?? 0))}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatNaira(summary.subtotal)}</Text>
            </View>
            <ActionButton label={submitting ? 'Submitting…' : pendingSale ? 'Retry sale confirmation' : 'Submit sale'} onPress={submitSale} disabled={submitting} busy={submitting} />
          </View>
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
  layout: {
    marginTop: 12,
  },
  panel: {backgroundColor: palette.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: palette.border, marginBottom: 14, ...elevation.card},
  panelTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  input: {backgroundColor: '#F8F9FE', borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, color: palette.text},
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 8,
  },
  paymentChip: {borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, minHeight: 46, backgroundColor: '#F8F9FE', borderWidth: 1, borderColor: palette.border, justifyContent: 'center'},
  paymentChipSelected: {
    backgroundColor: '#EDF1FF',
    borderColor: '#B9C8FF',
  },
  paymentChipText: {
    color: palette.muted,
    fontWeight: '700',
  },
  paymentChipTextSelected: {
    color: palette.primary,
  },
  productRow: {backgroundColor: palette.surface, borderRadius: 16, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center'},
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  cartControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {width: 42, height: 42, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center'},
  qtyButtonText: {
    color: palette.primary,
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 20,
  },
  qtyValue: {
    minWidth: 20,
    textAlign: 'center',
    color: palette.text,
    fontWeight: '800',
  },
  productName: {
    color: palette.text,
    fontWeight: '700',
    marginBottom: 2,
  },
  productMeta: {
    color: palette.muted,
    fontSize: 12,
  },
  addButton: {
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  summaryBox: {backgroundColor: '#F4F6FC', borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1, borderColor: palette.border},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryProductInfo: {
    flex: 1,
    marginRight: 12,
  },
  summaryText: {
    color: palette.text,
    fontSize: 13,
  },
  summaryCartControls: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryQtyButton: {width: 42, height: 42, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center'},
  summaryQtyButtonText: {
    color: palette.primary,
    fontWeight: '800',
    fontSize: 16,
    lineHeight: 18,
  },
  summaryQtyValue: {
    minWidth: 20,
    textAlign: 'center',
    color: palette.text,
    fontWeight: '700',
  },
  totalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#edf0f7',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    color: palette.text,
    fontWeight: '800',
  },
  totalValue: {
    color: palette.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  emptyText: {
    color: palette.muted,
    lineHeight: 22,
  },
});
