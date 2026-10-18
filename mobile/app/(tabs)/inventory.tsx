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
import { formatNaira, parseNairaToKobo } from '../../utils/money';
import { canPerform } from '../../utils/permissions';

type Product = {
  id: string;
  name: string;
  category?: string;
  stock?: number;
  sellable?: number;
  price?: number;
  active?: boolean;
  version?: number;
  reorder?: number;
  barcode?: string;
};

type Account = {
  role?: string;
  allowed_operations?: string[];
};

type PurchasePayload = {
  kind: 'purchase';
  request_id: string;
  product_id: string;
  quantity: number;
  unit_amount: number;
  payment: 'Cash';
  party: string;
  batch_code: string;
  expires: string | null;
  created: string;
};

const emptyProductForm = {
  name: '',
  category: '',
  price: '0',
  reorder: '0',
  barcode: '',
  active: true,
};


export default function InventoryTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [restocking, setRestocking] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [pendingPurchase, setPendingPurchase] = useState<PurchasePayload | null>(null);
  const [purchaseStorageKey, setPurchaseStorageKey] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitAmount, setUnitAmount] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [expires, setExpires] = useState('');
  const [productMode, setProductMode] = useState<'create' | 'edit'>('create');
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');

  const canCreateProduct = canPerform(account, 'product');
  const canEditProduct = canPerform(account, 'product_update');
  const canPurchase = canPerform(account, 'purchase');

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

        const [me, productData] = await Promise.all([
          apiCall('/api/v1/me/', token),
          apiCall('/api/v1/products/', token),
        ]);
        const storageKey = pendingOperationKey('purchase', me?.account);
        const savedPurchase = storageKey ? await deviceStorage.getItemAsync(storageKey) : null;

        if (!active) return;
        const nextProducts = Array.isArray(productData?.products) ? productData.products : [];
        setAccount(me?.account ?? null);
        setProducts(nextProducts);
        setPurchaseStorageKey(storageKey);
        if (nextProducts.length === 0) setSelectedProductId('');
        if (nextProducts.length > 0) {
          setSelectedProductId((current) => nextProducts.some((product: Product) => product.id === current) ? current : nextProducts[0].id);
        }
        if (savedPurchase) {
          try {
            const payload = JSON.parse(savedPurchase) as PurchasePayload;
            if (payload?.kind === 'purchase' && payload.request_id && payload.product_id && payload.quantity > 0) {
              setPendingPurchase(payload);
              setSelectedProductId(payload.product_id);
              setQuantity(String(payload.quantity));
              setUnitAmount(String(payload.unit_amount / 100));
              setBatchCode(payload.batch_code || 'LOT-');
              setExpires(payload.expires || '');
              setNotice('A stock purchase is awaiting confirmation. Retry to safely confirm the same request.');
            }
          } catch {
            if (storageKey) await deviceStorage.deleteItemAsync(storageKey);
          }
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Unable to load inventory.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []));

  const selectedProduct = useMemo(() => products.find((product) => product.id === selectedProductId) ?? products[0], [products, selectedProductId]);

  const loadProducts = async () => {
    const { token } = await getSession();
    if (!token) return;
    const data = await apiCall('/api/v1/products/', token);
    const nextProducts = Array.isArray(data?.products) ? data.products : [];
    setProducts(nextProducts);
    if (nextProducts.length === 0) setSelectedProductId('');
    if (nextProducts.length > 0) {
      setSelectedProductId((current) => nextProducts.some((product: Product) => product.id === current) ? current : nextProducts[0].id);
    }
  };

  const startCreateProduct = () => {
    setProductMode('create');
    setProductForm({ ...emptyProductForm, name: '', category: '', price: '0', reorder: '0', barcode: '', active: true });
  };

  const startEditProduct = () => {
    if (!selectedProduct) return;
    setProductMode('edit');
    setProductForm({
      name: selectedProduct.name || '',
      category: selectedProduct.category || '',
      price: String((selectedProduct.price ?? 0) / 100),
      reorder: String(selectedProduct.reorder ?? 0),
      barcode: selectedProduct.barcode || '',
      active: selectedProduct.active !== false,
    });
  };

  const submitProduct = async () => {
    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to manage products.');
      return;
    }

    const rawName = productForm.name.trim();
    const rawCategory = productForm.category.trim();
    const rawPrice = Number(productForm.price);
    const rawReorder = Number(productForm.reorder);
    if (!rawName) {
      setError('Add a product name first.');
      return;
    }
    if (!rawCategory) {
      setError('Choose a product category.');
      return;
    }
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      setError('Enter a valid selling price.');
      return;
    }
    if (!Number.isSafeInteger(rawReorder) || rawReorder < 0) {
      setError('Enter a valid reorder level.');
      return;
    }

    setProductSaving(true);
    setError('');
    setNotice('');

    try {
      const base = {
        request_id: makeRequestId(),
        kind: productMode === 'edit' ? 'product_update' : 'product',
        name: rawName,
        category: rawCategory,
        price: Math.round(rawPrice * 100),
        reorder: Math.round(rawReorder),
        barcode: productForm.barcode.trim(),
        photo: '',
      } as Record<string, any>;

      if (productMode === 'edit' && selectedProduct) {
        base.product_id = selectedProduct.id;
        base.version = selectedProduct.version ?? 1;
        base.active = productForm.active;
      }

      await apiCall('/api/v1/products/', token, base);
      await loadProducts();
      setNotice(productMode === 'edit' ? 'Product updated.' : 'Product created.');
      setProductForm({ ...emptyProductForm, active: true });
      setProductMode('create');
    } catch (err: any) {
      setError(err?.message || 'Unable to save the product.');
    } finally {
      setProductSaving(false);
    }
  };

  const submitStockIn = async () => {
    if (!pendingPurchase && !selectedProduct) {
      setError('Choose a product to restock.');
      return;
    }

    if (!pendingPurchase) {
      const parsedQty = Number(quantity);
      const parsedUnit = parseNairaToKobo(unitAmount);
      if (!Number.isSafeInteger(parsedQty) || parsedQty <= 0) {
        setError('Enter a quantity greater than zero.');
        return;
      }
      if (parsedUnit === null || parsedUnit <= 0) {
        setError('Enter a valid unit cost.');
        return;
      }
    }

    const { token } = await getSession();
    if (!token) {
      setError('Please sign in again to continue stock in.');
      return;
    }

    setRestocking(true);
    setError('');
    setNotice('');

    try {
      const payload: PurchasePayload = pendingPurchase ?? {
        kind: 'purchase',
        request_id: makeRequestId(),
        product_id: selectedProduct!.id,
        quantity: Number(quantity),
        unit_amount: parseNairaToKobo(unitAmount)!,
        payment: 'Cash',
        party: 'Supplier purchase',
        batch_code: batchCode || 'LOT-' + selectedProduct.id.slice(0, 8),
        expires: expires || null,
        created: new Date().toISOString(),
      };

      if (!pendingPurchase) {
        if (!purchaseStorageKey) throw new Error('Unable to securely prepare purchase recovery. Sign in again and retry.');
        await deviceStorage.setItemAsync(purchaseStorageKey, JSON.stringify(payload));
        setPendingPurchase(payload);
      }

      const result = await apiCall('/api/v1/purchases/', token, payload);
      if (purchaseStorageKey) await deviceStorage.deleteItemAsync(purchaseStorageKey);
      setPendingPurchase(null);
      setNotice(result?.ok ? `Stock added. ${payload.quantity} units were restocked.` : 'Stock added successfully.');
      setQuantity('');
      setUnitAmount('');
      setBatchCode('');
      setExpires('');
    } catch (err: any) {
      setError(err?.message || 'Unable to record stock purchase.');
      if (!pendingPurchase) setNotice('The purchase request was saved securely. Retry will reuse the same request.');
    } finally {
      setRestocking(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || (product.category || '').toLowerCase().includes(searchTerm.toLowerCase());
    const stock = Number(product.sellable ?? product.stock ?? 0);
    const isLow = product.active !== false && stock <= 5;
    const isOut = product.active !== false && stock === 0;

    if (stockFilter === 'in-stock') return matchesSearch && stock > 0;
    if (stockFilter === 'low-stock') return matchesSearch && isLow && stock > 0;
    if (stockFilter === 'out-of-stock') return matchesSearch && isOut;
    return matchesSearch;
  });

  return (
    <ScreenFrame title="Inventory" eyebrow="YOUR COLLECTION, IN PERFECT ORDER" subtitle="See what is available, what needs attention, and what is ready to sell.">
      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={palette.primary} /><Text style={styles.loadingText}>Loading products…</Text></View>
      ) : null}
      {!loading && error ? <FeedbackBanner kind="error" message={error} onDismiss={() => setError('')} /> : null}
      {!loading && notice ? <FeedbackBanner kind="info" message={notice} onDismiss={() => setNotice('')} /> : null}
      {!loading ? (
        <View style={styles.list}>
          <View style={styles.searchPanel}>
            <TextInput
              style={styles.searchInput}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search products"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.filterRow}>
              {(['all', 'in-stock', 'low-stock', 'out-of-stock'] as const).map((filter) => (
                <Pressable
                  key={filter}
                  style={[styles.filterChip, stockFilter === filter && styles.filterChipSelected]}
                  onPress={() => setStockFilter(filter)}
                >
                  <Text style={[styles.filterChipText, stockFilter === filter && styles.filterChipTextSelected]}>
                    {filter === 'all' ? 'All' : filter === 'in-stock' ? 'In Stock' : filter === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {filteredProducts.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No matching products found for this store.</Text></View> : filteredProducts.map((product) => {
            const stock = Number(product.sellable ?? product.stock ?? 0);
            const isLow = product.active !== false && stock <= 5;
            const isOut = product.active !== false && stock === 0;
            return (
              <Pressable key={product.id} onPress={() => setSelectedProductId(product.id)} disabled={Boolean(pendingPurchase)} style={[styles.item, selectedProduct?.id === product.id && styles.itemSelected]}>
                <View style={styles.headerRow}>
                  <Text style={styles.name}>{product.name}</Text>
                  <Text style={isOut ? styles.outTag : isLow ? styles.lowTag : styles.stockTag}>{isOut ? 'Out of stock' : isLow ? 'Low stock' : 'Healthy'}</Text>
                </View>
                <Text style={styles.meta}>{product.category || 'General'} • {formatNaira(Number(product.price ?? 0))}</Text>
                <Text style={styles.meta}>Sellable: {stock} • Stock on hand: {Number(product.stock ?? 0)}</Text>
              </Pressable>
            );
          })}

          {canEditProduct && selectedProduct ? <ActionButton label="Edit selected product" onPress={startEditProduct} /> : null}

          {canCreateProduct || (productMode === 'edit' && canEditProduct) ? (
            <View style={styles.formPanel}>
              <Text style={styles.formTitle}>{productMode === 'edit' ? 'Edit product' : 'Add product'}</Text>
              <TextInput
                style={styles.input}
                value={productForm.name}
                onChangeText={(value) => setProductForm((current) => ({ ...current, name: value }))}
                placeholder="Product name"
              />
              <TextInput
                style={styles.input}
                value={productForm.category}
                onChangeText={(value) => setProductForm((current) => ({ ...current, category: value }))}
                placeholder="Category"
              />
              <TextInput
                style={styles.input}
                value={productForm.price}
                onChangeText={(value) => setProductForm((current) => ({ ...current, price: value }))}
                keyboardType="decimal-pad"
                placeholder="Selling price"
              />
              <TextInput
                style={styles.input}
                value={productForm.reorder}
                onChangeText={(value) => setProductForm((current) => ({ ...current, reorder: value }))}
                keyboardType="numeric"
                placeholder="Reorder level"
              />
              <TextInput
                style={styles.input}
                value={productForm.barcode}
                onChangeText={(value) => setProductForm((current) => ({ ...current, barcode: value }))}
                placeholder="Barcode (optional)"
              />
              <View style={styles.inlineRow}>
                <Text style={styles.inlineLabel}>{productForm.active ? 'Active product' : 'Archived product'}</Text>
                <ActionButton label={productForm.active ? 'On' : 'Off'} onPress={() => setProductForm((current) => ({ ...current, active: !current.active }))} />
              </View>
              <View style={styles.inlineRow}>
                <ActionButton label={productMode === 'edit' ? 'Save changes' : 'Create product'} onPress={submitProduct} disabled={productSaving} busy={productSaving} />
                {productMode === 'edit' ? <ActionButton label={canCreateProduct ? 'Cancel' : 'Close'} onPress={startCreateProduct} /> : null}
              </View>
            </View>
          ) : null}

          {(selectedProduct || pendingPurchase) && canPurchase ? (
            <View style={styles.formPanel}>
              <Text style={styles.formTitle}>{pendingPurchase ? 'Pending stock purchase' : 'Stock in'}</Text>
              <Text style={styles.formSubtitle}>{selectedProduct?.name || products.find((product) => product.id === pendingPurchase?.product_id)?.name || 'Saved purchase'}</Text>

              <TextInput
                style={styles.input}
                value={String(quantity)}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="Quantity"
                editable={!pendingPurchase}
              />

              <TextInput
                style={styles.input}
                value={String(unitAmount)}
                onChangeText={setUnitAmount}
                keyboardType="decimal-pad"
                placeholder="Unit cost (₦)"
                editable={!pendingPurchase}
              />

              <TextInput
                style={styles.input}
                value={batchCode}
                onChangeText={setBatchCode}
                placeholder="Batch code"
                editable={!pendingPurchase}
              />

              <TextInput
                style={styles.input}
                value={expires}
                onChangeText={setExpires}
                placeholder="Expiry date (YYYY-MM-DD)"
                editable={!pendingPurchase}
              />

              <ActionButton label={restocking ? 'Recording stock…' : pendingPurchase ? 'Retry purchase confirmation' : 'Record stock in'} onPress={submitStockIn} disabled={restocking} busy={restocking} />
            </View>
          ) : null}
          {pendingPurchase && !canPurchase ? <Text style={styles.noticeText}>A saved purchase is waiting, but your account no longer has purchase access. The request remains securely stored.</Text> : null}
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
  list: {
    marginTop: 12,
  },
  item: {backgroundColor: palette.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: palette.border, ...elevation.card},
  itemSelected: {
    borderColor: palette.primary,
    backgroundColor: '#F7F8FE',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  name: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  meta: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  stockTag: {
    backgroundColor: '#eafaf0',
    color: '#107c41',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
  },
  lowTag: {
    backgroundColor: '#fff1e7',
    color: '#b86d00',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
  },
  searchPanel: {backgroundColor: palette.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: palette.border, ...elevation.card},
  searchInput: {backgroundColor: '#F8F9FE', color: palette.text, borderRadius: 14, minHeight: 50, paddingHorizontal: 15, borderWidth: 1, borderColor: palette.border},
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {paddingHorizontal: 14, paddingVertical: 11, minHeight: 44, borderRadius: 999, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, justifyContent: 'center'},
  filterChipSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipTextSelected: {
    color: '#ffffff',
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
    textAlign: 'center',
    lineHeight: 22,
  },
  outTag: {
    backgroundColor: '#ffebee',
    color: '#b42318',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
  },
  formPanel: {backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 18, marginTop: 12, ...elevation.card},
  formTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '800',
  },
  formSubtitle: {
    color: palette.muted,
    marginTop: 4,
    marginBottom: 12,
  },
  input: {backgroundColor: '#F8F9FE', borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, color: palette.text},
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  inlineLabel: {
    color: palette.muted,
    fontWeight: '700',
    flex: 1,
  },
});
