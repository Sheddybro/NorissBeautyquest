import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg';
import { ScreenFrame } from '../../components/ScreenFrame';
import { apiCall } from '../../services/api';
import { getSession } from '../../services/session';
import { elevation, palette } from '../../theme/tokens';
import { formatCompactNaira, formatNaira } from '../../utils/money';
import { canPerform } from '../../utils/permissions';

type Product = {
  id: string;
  name: string;
  category?: string;
  stock?: number;
  sellable?: number;
  active?: boolean;
  price?: number;
  reorder?: number;
};

type Receipt = {
  id: string;
  total?: number;
  reference?: string;
  party?: string;
  created?: string;
};

type DashboardResponse = {
  account?: { store_name?: string; username?: string; role?: string; allowed_operations?: string[] };
  products?: Product[];
  receipts?: Receipt[];
  metrics?: {
    sales_today?: number;
    purchases_today?: number;
    refunds_today?: number;
    net_sales_today?: number;
    transactions_today?: number;
    sales_trend?: Array<{ day: string; amount: number }>;
  };
};

const formatShortDate = (value?: string) => {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
};

export default function HomeTab() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      const { token } = await getSession();
      if (!token) {
        setDashboard(null);
        setLoading(false);
        return;
      }

      const data = await apiCall('/api/v1/dashboard/', token);
      setDashboard(data);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setError('');
    loadDashboard();
  }, [loadDashboard]));

  const products = dashboard?.products ?? [];
  const receipts = dashboard?.receipts ?? [];

  const netSalesToday = Number(dashboard?.metrics?.net_sales_today ?? 0);
  const transactionsToday = Number(dashboard?.metrics?.transactions_today ?? 0);

  const stockOnHand = useMemo(
    () => products.reduce((total, product) => total + Number(product.stock ?? 0), 0),
    [products],
  );

  const lowStockAlerts = useMemo(
    () => products.filter((product) => product.active !== false && Number(product.stock ?? 0) <= Number(product.reorder ?? 5)),
    [products],
  );

  const chartValues = useMemo(() => {
    const buckets = dashboard?.metrics?.sales_trend ?? [];
    const maxValue = Math.max(...buckets.map((bucket) => Number(bucket.amount) || 0), 0);
    const plot = { left: 68, right: 708, top: 18, bottom: 205 };
    const yFor = (value: number) => plot.bottom - (maxValue ? value / maxValue : 0) * (plot.bottom - plot.top);
    const points = buckets.map((bucket, index) => ({
      key: bucket.day,
      label: formatTrendDay(bucket.day),
      value: Number(bucket.amount) || 0,
      x: plot.left + (buckets.length > 1 ? index * (plot.right - plot.left) / (buckets.length - 1) : 0),
      y: yFor(Number(bucket.amount) || 0),
    }));
    const line = points.map((point) => `${point.x},${point.y}`).join(' ');
    const area = points.length ? `M ${points[0].x} ${plot.bottom} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points[points.length - 1].x} ${plot.bottom} Z` : '';
    return { points, line, area, maxValue, plot };
  }, [dashboard?.metrics?.sales_trend]);

  const recentReceipts = receipts.slice(0, 4);
  const lowStockProducts = useMemo(() => products
    .filter((product) => product.active !== false && Number(product.stock ?? 0) <= Number(product.reorder ?? 5))
    .slice(0, 4), [products]);
  const storeName = dashboard?.account?.store_name || 'Noriss Beautyquest';
  const canCheckout = canPerform(dashboard?.account, 'checkout');

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
  };

  return (
    <ScreenFrame title="Shop overview" eyebrow="YOUR BUSINESS, AT A GLANCE" subtitle="A clear view of your shop, from today’s sales to the stock on your shelves." scrollable={false}>
      <ScrollView
        style={styles.dashboardScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.primary} colors={[palette.primary]} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={palette.primary} /><Text style={styles.loadingText}>Loading your dashboard…</Text></View>
        ) : null}

        {!loading && error ? <View style={styles.errorPanel}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); loadDashboard(); }} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}

        {!loading ? (
          <>
            <View style={styles.grid}>
              <View style={styles.card}><Text style={styles.label}>Sales today</Text><Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatNaira(netSalesToday)}</Text><Text style={styles.detail}>{transactionsToday} transactions · {formatNaira(Number(dashboard?.metrics?.refunds_today ?? 0))} refunded</Text></View>
              <View style={styles.card}><Text style={styles.label}>Purchases today</Text><Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatNaira(Number(dashboard?.metrics?.purchases_today ?? 0))}</Text><Text style={styles.detail}>Stock purchases</Text></View>
              <View style={styles.card}><Text style={styles.label}>Stock on hand</Text><Text style={styles.value}>{stockOnHand.toLocaleString('en-NG')} units</Text><Text style={styles.detail}>{products.length} products · local stock estimate</Text></View>
              <View style={[styles.card, lowStockAlerts.length > 0 && styles.warningCard]}><Text style={styles.label}>Low stock</Text><Text style={[styles.value, lowStockAlerts.length > 0 && styles.warningValue]}>{String(lowStockAlerts.length)}</Text><Text style={styles.detail}>Products at their reorder level</Text></View>
            </View>

            <View style={styles.panel}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Sales this week</Text>
                <Text style={styles.panelCaption}>Last 7 days · Lagos time</Text>
              </View>
              {chartValues.points.length === 0 ? <Text style={styles.emptyState}>Sales history will appear here when available.</Text> : (
                <Svg viewBox="0 0 720 240" width="100%" height={220} accessibilityLabel="Sales over the last seven days">
                  <Defs><LinearGradient id="mobile-sales-area" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={palette.primary} stopOpacity="0.22" /><Stop offset="1" stopColor={palette.primary} stopOpacity="0" /></LinearGradient></Defs>
                  {[0, 1, 2, 3].map((tick) => {
                    const y = chartValues.plot.top + tick * (chartValues.plot.bottom - chartValues.plot.top) / 3;
                    const amount = Math.round(chartValues.maxValue * (1 - tick / 3));
                    return <React.Fragment key={tick}><Line x1={chartValues.plot.left} y1={y} x2={chartValues.plot.right} y2={y} stroke={palette.border} strokeWidth={1} /><SvgText x={chartValues.plot.left - 8} y={y + 4} fill={palette.muted} fontSize={10} textAnchor="end">{formatCompactNaira(amount)}</SvgText></React.Fragment>;
                  })}
                  <Path d={chartValues.area} fill="url(#mobile-sales-area)" />
                  <Path d={`M ${chartValues.line.replaceAll(',', ' ')}`} fill="none" stroke={palette.primary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  {chartValues.points.map((point) => <React.Fragment key={point.key}><Circle cx={point.x} cy={point.y} r={4} fill="#fff" stroke={palette.primary} strokeWidth={2.5} /><SvgText x={point.x} y={230} fill={palette.muted} fontSize={10} textAnchor="middle">{point.label}</SvgText></React.Fragment>)}
                </Svg>
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Stock watch</Text>
                <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/inventory')}><Text style={styles.stockLink}>View inventory ↗</Text></Pressable>
              </View>
              {lowStockProducts.length ? lowStockProducts.map((product) => (
                <View key={product.id} style={styles.stockRow}>
                  <View style={styles.stockIcon}><Text style={styles.stockIconText}>◇</Text></View>
                  <View style={styles.stockCopy}><Text style={styles.stockName} numberOfLines={1}>{product.name}</Text><Text style={styles.stockCategory}>{product.category || 'General'}</Text></View>
                  <Text style={styles.stockWarning}>{Number(product.stock ?? 0)} left</Text>
                </View>
              )) : <Text style={styles.emptyState}>{products.length ? 'All products are above their reorder levels.' : 'Add products to start monitoring stock.'}</Text>}
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.actionRow}>
                {canCheckout ? (
                  <Pressable accessibilityRole="button" style={styles.actionButton} onPress={() => router.replace('/(tabs)/sell')}>
                    <Text style={styles.actionButtonText}>New sale</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" style={canCheckout ? styles.actionButtonSecondary : styles.actionButton} onPress={() => router.replace('/(tabs)/inventory')}>
                  <Text style={canCheckout ? styles.actionButtonSecondaryText : styles.actionButtonText}>Inventory</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Recent receipts</Text>
                <Text style={styles.panelCaption}>Latest activity</Text>
              </View>
              {recentReceipts.length === 0 ? (
                <Text style={styles.emptyState}>No receipts have been recorded yet.</Text>
              ) : recentReceipts.map((receipt) => (
                <View key={receipt.id} style={styles.receiptRow}>
                  <View>
                    <Text style={styles.receiptReference}>{receipt.reference || 'Receipt'}</Text>
                    <Text style={styles.receiptMeta}>{receipt.party || 'Walk-in customer'} • {formatShortDate(receipt.created)}</Text>
                  </View>
                  <Text style={styles.receiptTotal}>{formatNaira(Number(receipt.total ?? 0))}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenFrame>
  );
}

function formatTrendDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-NG', { weekday: 'short' });
}

const styles = StyleSheet.create({
  dashboardScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  loadingBox: {
    marginTop: 18,
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: palette.muted,
    fontWeight: '700',
  },
  errorPanel: {backgroundColor: '#fff3f2', padding: 14, borderRadius: 16, marginTop: 12, borderColor: '#f1c7c3', borderWidth: 1},
  retryButton: {alignSelf: 'flex-start', backgroundColor: palette.primary, borderRadius: 12, marginTop: 12, paddingHorizontal: 16, paddingVertical: 11, minHeight: 44, justifyContent: 'center'},
  retryText: {color: '#fff', fontWeight: '800'},
  errorText: {
    marginTop: 16,
    color: palette.danger,
    fontWeight: '700',
  },
  heroCard: {backgroundColor: palette.primaryDark, borderRadius: 16, padding: 20, marginTop: 10, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#26365E'},
  heroCopy: {
    flex: 1,
    gap: 5,
  },
  heroMeta: {
    color: '#dbe4ff',
    fontSize: 12,
    fontWeight: '600',
  },
  heroBadge: {
    minWidth: 88,
    alignItems: 'center',
    backgroundColor: '#ffffff1c',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  heroBadgeLabel: {
    color: '#dbe4ff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroBadgeValue: {
    color: palette.surface,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 4,
  },
  eyebrow: {
    color: '#d9e2ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTotal: {
    color: palette.surface,
    fontWeight: '900',
    fontSize: 30,
    lineHeight: 36,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginTop: 10,
  },
  card: {backgroundColor: palette.surface, borderRadius: 12, padding: 15, borderWidth: 1, borderColor: palette.border, width: '48%', flexGrow: 0, minHeight: 128, ...elevation.card},
  accentValue: {
    color: palette.accent,
  },
  warningCard: {
    backgroundColor: '#fffaf0',
    borderColor: '#f0d8a8',
  },
  warningValue: {
    color: palette.warning,
  },
  dangerCard: {
    backgroundColor: '#fff5f4',
    borderColor: '#f1c7c3',
  },
  dangerValue: {
    color: palette.danger,
  },
  label: {
    fontSize: 12,
    color: palette.muted,
    marginBottom: 10,
    fontWeight: '700',
  },
  detail: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  value: {
    fontSize: 24,
    fontWeight: '900',
    color: palette.text,
  },
  panel: {backgroundColor: palette.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: palette.border, marginTop: 14, ...elevation.card},
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  panelCaption: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  stockLink: {
    color: '#6246BB',
    fontSize: 10,
    fontWeight: '700',
  },
  stockRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
  },
  stockIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primarySoft,
  },
  stockIconText: {
    color: palette.primary,
    fontSize: 23,
    fontWeight: '700',
  },
  stockCopy: {
    flex: 1,
    minWidth: 0,
  },
  stockName: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  stockCategory: {
    color: palette.muted,
    fontSize: 10,
    marginTop: 3,
  },
  stockWarning: {
    color: '#A26D36',
    backgroundColor: '#FEF5E9',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: '600',
    overflow: 'hidden',
  },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    gap: 8,
    justifyContent: 'space-around',
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 32,
  },
  bar: {
    width: '100%',
    minHeight: 18,
    borderRadius: 10,
    backgroundColor: palette.primary,
    opacity: 0.88,
    marginTop: 8,
  },
  barValue: {
    fontSize: 9,
    color: palette.muted,
    fontWeight: '700',
    textAlign: 'center',
  },
  dayLabel: {
    marginTop: 6,
    color: palette.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {flex: 1, backgroundColor: palette.primary, borderRadius: 10, paddingVertical: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center'},
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  actionButtonSecondary: {flex: 1, backgroundColor: palette.primarySoft, borderRadius: 10, paddingVertical: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border},
  actionButtonSecondaryText: {
    color: palette.text,
    fontWeight: '800',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f8',
  },
  receiptReference: {
    color: palette.text,
    fontWeight: '700',
  },
  receiptMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
  },
  receiptTotal: {
    color: palette.primary,
    fontWeight: '800',
  },
  emptyState: {
    color: palette.muted,
    lineHeight: 20,
  },
});
