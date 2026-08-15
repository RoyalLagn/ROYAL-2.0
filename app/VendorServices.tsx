import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  PackagePlus,
  Pencil,
  Power,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useVendorPackages } from "@/hooks/useVendorPackages";
import PackageEditorModal from "@/components/packages/PackageEditorModal";
import PackageDisplayCard, { packagePriceLabel } from "@/components/packages/PackageDisplayCard";
import {
  VendorPackageService,
  type VendorPackage,
  type VendorPackageInput,
  type VendorPackageStatus,
} from "@/services/vendorPackages";
import { SkeletonBone, SkeletonLines } from "@/components/loading/Skeleton";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useAppFeedback } from "@/context/AppFeedbackContext";
import Pressable from "@/components/InteropSafePressable";

type VendorColors = (typeof vendorTheme)[keyof typeof vendorTheme];

export default function VendorServices() {
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const dark = colorScheme === "dark";
  const {
    data,
    loading: workspaceLoading,
    error: workspaceError,
    refresh: refreshWorkspace,
  } = useVendorWorkspace();
  const vendorId = data.vendor?.id as string | undefined;
  const { packages, loading: packagesLoading, error: packagesError, refresh } = useVendorPackages(vendorId, false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<VendorPackage | null>(null);
  const [preview, setPreview] = useState<VendorPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loading = workspaceLoading || packagesLoading;
  const error = workspaceError || packagesError;
  const interactionsDisabled = Boolean(busyId) || saving;

  const activeCount = packages.filter((item) => item.status === "active").length;
  const draftCount = packages.filter((item) => item.status === "draft").length;
  const inactiveCount = packages.filter((item) => item.status === "inactive").length;

  const openEditor = (item: VendorPackage | null = null) => {
    if (!vendorId || interactionsDisabled) return;
    setEditing(item);
    setEditorOpen(true);
  };

  const save = async (input: VendorPackageInput) => {
    if (!vendorId || saving) return;
    setSaving(true);
    try {
      await VendorPackageService.save(input, editing?.id);
      setEditorOpen(false);
      setEditing(null);
      await refresh();
      showSuccess(input.status === "draft" ? "Package draft saved" : input.status === "active" ? "Package published" : "Package saved");
    } catch (cause) {
      Alert.alert("Package not saved", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item: VendorPackage, status: VendorPackageStatus) => {
    if (!vendorId || busyId) return;
    setBusyId(item.id);
    try {
      await VendorPackageService.setStatus(item.id, vendorId, status);
      await refresh(true);
      showSuccess(status === "active" ? "Package activated" : "Package deactivated");
    } catch (cause) {
      Alert.alert("Package not updated", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const requestStatusChange = (item: VendorPackage, status: VendorPackageStatus) => {
    if (status === "active") {
      void changeStatus(item, status);
      return;
    }
    Alert.alert(
      "Deactivate package?",
      `${item.title} will be hidden from customers. Existing enquiries are not affected.`,
      [
        { text: "Keep active", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => void changeStatus(item, status) },
      ],
    );
  };

  const remove = (item: VendorPackage) => Alert.alert(
    "Delete package?",
    `${item.title} and its included service items will be permanently removed. Existing enquiries keep the package name.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!vendorId || busyId) return;
          setBusyId(item.id);
          try {
            await VendorPackageService.remove(item.id, vendorId);
            await refresh(true);
            showSuccess("Package deleted");
          } catch (cause) {
            Alert.alert("Package not deleted", cause instanceof Error ? cause.message : "Please try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ],
  );

  const move = async (index: number, direction: -1 | 1) => {
    if (!vendorId || busyId) return;
    const target = index + direction;
    if (target < 0 || target >= packages.length) return;
    const ordered = packages.map((item) => item.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusyId(packages[index].id);
    try {
      await VendorPackageService.reorder(vendorId, ordered);
      await refresh(true);
      showSuccess("Package order updated");
    } catch (cause) {
      Alert.alert("Order not updated", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const retry = async () => {
    if (workspaceError || !vendorId) await refreshWorkspace();
    else await refresh();
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heading, compact && styles.headingCompact]}>
          <View style={styles.flex}>
            <Text style={[styles.title, { color: colors.text }]}>Packages & pricing</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Create clear packages, publish the ones customers can book and keep drafts private.
            </Text>
          </View>
          <Pressable
            disabled={!vendorId || interactionsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Create new package"
            accessibilityState={{ disabled: !vendorId || interactionsDisabled }}
            onPress={() => openEditor()}
            style={({ pressed, focused }) => [
              styles.primary,
              compact && styles.primaryCompact,
              { backgroundColor: colors.pink },
              (!vendorId || interactionsDisabled) && styles.disabled,
              pressed && styles.pressed,
              focusStyle(focused, colors.pink),
            ]}
          >
            <PackagePlus size={18} color="#FFF" />
            <Text style={styles.primaryText}>New package</Text>
          </Pressable>
        </View>

        <View style={[styles.overview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.overviewHeader}>
            <View style={styles.flex}>
              <Text style={[styles.overviewTitle, { color: colors.text }]}>Package overview</Text>
              <Text style={[styles.overviewHint, { color: colors.muted }]}>Your current publishing status</Text>
            </View>
            <Pressable
              disabled={loading || interactionsDisabled}
              accessibilityRole="button"
              accessibilityLabel="Refresh packages"
              accessibilityState={{ disabled: loading || interactionsDisabled }}
              onPress={() => void retry()}
              style={({ pressed, focused }) => [
                styles.refresh,
                { backgroundColor: colors.background, borderColor: colors.border },
                (loading || interactionsDisabled) && styles.disabled,
                pressed && styles.pressed,
                focusStyle(focused, colors.pink),
              ]}
            >
              {loading ? <ActivityIndicator size="small" color={colors.pink} /> : <RefreshCw size={17} color={colors.pink} />}
            </Pressable>
          </View>
          <View style={styles.summary}>
            <Summary label="Total" value={loading ? "—" : packages.length} colors={colors} compact={compact} />
            <Summary label="Live" value={loading ? "—" : activeCount} colors={colors} compact={compact} />
            <Summary label="Drafts" value={loading ? "—" : draftCount} colors={colors} compact={compact} />
            <Summary label="Inactive" value={loading ? "—" : inactiveCount} colors={colors} compact={compact} />
          </View>
        </View>

        {loading ? (
          <View style={styles.list} accessibilityLabel="Loading packages">
            {[0, 1, 2].map((index) => (
              <View key={index} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.skeletonHeader}>
                  <View style={styles.flex}><SkeletonLines lines={2} gap={7} lastLineWidth="72%" /></View>
                  <SkeletonBone width={72} height={24} radius={12} />
                </View>
                <View style={styles.skeletonMeta}>
                  <SkeletonBone width={104} height={22} radius={8} />
                  <SkeletonBone width={132} height={18} radius={8} />
                </View>
                <View style={styles.skeletonActions}>
                  {[0, 1, 2, 3].map((action) => <SkeletonBone key={action} width={82} height={42} radius={12} />)}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Packages unavailable</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retry()}
              style={({ pressed, focused }) => [styles.retry, { backgroundColor: colors.pink }, pressed && styles.pressed, focusStyle(focused, colors.pink)]}
            >
              <Text style={styles.primaryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && !packages.length ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSoft }]}><PackagePlus size={25} color={colors.pink} /></View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Create your first package</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Add pricing, coverage and included services once, then customers can enquire about that exact package.</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!vendorId}
              accessibilityState={{ disabled: !vendorId }}
              onPress={() => openEditor()}
              style={({ pressed, focused }) => [
                styles.retry,
                { backgroundColor: colors.pink },
                !vendorId && styles.disabled,
                pressed && styles.pressed,
                focusStyle(focused, colors.pink),
              ]}
            >
              <Text style={styles.primaryText}>Create package</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && packages.length ? (
          <View style={styles.list}>
            <View style={styles.listHeading}>
              <Text style={[styles.listTitle, { color: colors.text }]}>Your packages</Text>
              <Text style={[styles.listCount, { color: colors.muted }]}>{packages.length} {packages.length === 1 ? "package" : "packages"}</Text>
            </View>
            {packages.map((item, index) => (
              <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.title}</Text>
                    <Text numberOfLines={3} style={[styles.description, { color: colors.muted }]}>{item.description || "No package description yet."}</Text>
                  </View>
                  <Status status={item.status} colors={colors} />
                </View>

                <View style={[styles.details, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                  <View style={styles.priceGroup}>
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Price</Text>
                    <Text style={[styles.price, { color: colors.text }]}>{packagePriceLabel(item)}</Text>
                  </View>
                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Included</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{item.items.filter((entry) => entry.item_type === "included").length} services</Text>
                  </View>
                  <View style={styles.detailGroup}>
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>Display order</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>Position {index + 1}</Text>
                  </View>
                </View>

                <View style={[styles.cardFooter, compact && styles.cardFooterCompact]}>
                  <View style={[styles.actions, compact && styles.actionsCompact]}>
                    <SmallAction compact={compact} disabled={interactionsDisabled} label="Preview" icon={Eye} onPress={() => setPreview(item)} colors={colors} />
                    <SmallAction compact={compact} disabled={interactionsDisabled} label="Edit" icon={Pencil} onPress={() => openEditor(item)} colors={colors} emphasis />
                    <SmallAction compact={compact} disabled={interactionsDisabled} label={item.status === "active" ? "Deactivate" : "Activate"} icon={Power} onPress={() => requestStatusChange(item, item.status === "active" ? "inactive" : "active")} colors={colors} />
                    <SmallAction compact={compact} disabled={interactionsDisabled} label="Delete" icon={Trash2} onPress={() => remove(item)} colors={colors} danger />
                  </View>

                  <View style={[styles.orderGroup, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.orderLabel, { color: colors.muted }]}>Move</Text>
                    <Pressable
                      disabled={index === 0 || interactionsDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${item.title} up`}
                      accessibilityState={{ disabled: index === 0 || interactionsDisabled }}
                      onPress={() => void move(index, -1)}
                      style={({ pressed, focused }) => [styles.orderButton, (index === 0 || interactionsDisabled) && styles.disabled, pressed && styles.pressed, focusStyle(focused, colors.pink)]}
                    >
                      <ArrowUp size={16} color={colors.text} />
                    </Pressable>
                    <Pressable
                      disabled={index === packages.length - 1 || interactionsDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${item.title} down`}
                      accessibilityState={{ disabled: index === packages.length - 1 || interactionsDisabled }}
                      onPress={() => void move(index, 1)}
                      style={({ pressed, focused }) => [styles.orderButton, (index === packages.length - 1 || interactionsDisabled) && styles.disabled, pressed && styles.pressed, focusStyle(focused, colors.pink)]}
                    >
                      <ArrowDown size={16} color={colors.text} />
                    </Pressable>
                    {busyId === item.id ? <ActivityIndicator size="small" color={colors.pink} /> : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PackageEditorModal
        visible={editorOpen}
        vendorId={vendorId ?? ""}
        item={editing}
        dark={dark}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setEditorOpen(false);
            setEditing(null);
          }
        }}
        onSave={(input) => void save(input)}
      />
      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBackdrop}>
          <View style={[styles.previewSheet, { backgroundColor: colors.background }]}>
            <View style={styles.previewHeader}>
              <View style={styles.flex}>
                <Text style={[styles.previewTitle, { color: colors.text }]}>Customer preview</Text>
                <Text style={[styles.previewHint, { color: colors.muted }]}>This is how your package information will appear.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={() => setPreview(null)}
                style={({ pressed, focused }) => [styles.closeButton, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressed, focusStyle(focused, colors.pink)]}
              >
                <X size={19} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>{preview ? <PackageDisplayCard item={preview} dark={dark} preview /> : null}</ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function focusStyle(focused: boolean, color: string) {
  return focused && Platform.OS === "web"
    ? ({ outlineColor: color, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as never)
    : null;
}

function Summary({ label, value, colors, compact }: { label: string; value: number | string; colors: VendorColors; compact: boolean }) {
  return (
    <View style={[styles.summaryItem, compact && styles.summaryItemCompact]}>
      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function Status({ status, colors }: { status: VendorPackageStatus; colors: VendorColors }) {
  const tint = status === "active" ? colors.success : status === "draft" ? colors.warning : colors.muted;
  return (
    <View style={[styles.status, { backgroundColor: `${tint}18` }]}>
      <View style={[styles.statusDot, { backgroundColor: tint }]} />
      <Text style={[styles.statusText, { color: tint }]}>{status === "active" ? "Live" : status.charAt(0).toUpperCase() + status.slice(1)}</Text>
    </View>
  );
}

function SmallAction({ label, icon: Icon, onPress, colors, danger, emphasis, disabled, compact }: {
  label: string;
  icon: React.ElementType;
  onPress: () => void;
  colors: VendorColors;
  danger?: boolean;
  emphasis?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dangerColor = colors === vendorTheme.dark ? "#FB7185" : "#C83B55";
  const foreground = danger ? dangerColor : emphasis ? colors.pink : colors.text;
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      android_ripple={{ color: "rgba(233,30,99,0.08)" }}
      onPress={onPress}
      style={({ pressed, focused, hovered }) => [
        styles.smallAction,
        compact && styles.smallActionCompact,
        {
          backgroundColor: emphasis || hovered ? colors.surfaceSoft : colors.background,
          borderColor: danger ? `${dangerColor}3D` : colors.border,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
        focusStyle(focused, colors.pink),
      ]}
    >
      <Icon size={15} color={foreground} />
      <Text style={[styles.smallActionText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  flex: { flex: 1, minWidth: 0 },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 20, marginBottom: 20 },
  headingCompact: { flexDirection: "column", gap: 14 },
  title: { ...typeStyles.pageTitle },
  subtitle: { ...typeStyles.bodyCompact, marginTop: 5, maxWidth: 590 },
  primary: { minHeight: 48, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryCompact: { width: "100%" },
  primaryText: { color: "#FFF", ...typeStyles.button },
  overview: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 24 },
  overviewHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  overviewTitle: { fontSize: typeScale.body, fontWeight: "700" },
  overviewHint: { ...typeStyles.caption, marginTop: 2 },
  refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  summary: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  summaryItem: { width: "25%", paddingRight: 12 },
  summaryItemCompact: { width: "50%" },
  summaryLabel: { ...typeStyles.caption },
  summaryValue: { ...typeStyles.metric, marginTop: 2 },
  list: { gap: 12 },
  listHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 2 },
  listTitle: { ...typeStyles.sectionTitle },
  listCount: { ...typeStyles.metadata },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  name: { fontSize: typeScale.body, fontWeight: "700", lineHeight: typeLeading.body },
  description: { ...typeStyles.bodyCompact, marginTop: 4, maxWidth: 680 },
  status: { minHeight: 28, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...typeStyles.label },
  details: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13, marginTop: 14 },
  priceGroup: { minWidth: 150 },
  detailGroup: { minWidth: 96 },
  detailLabel: { ...typeStyles.caption },
  price: { fontSize: typeScale.body, fontWeight: "700", marginTop: 3 },
  detailValue: { ...typeStyles.metadata, fontWeight: "600", marginTop: 3 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 },
  cardFooterCompact: { flexDirection: "column", alignItems: "stretch" },
  actions: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionsCompact: { width: "100%" },
  smallAction: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  smallActionCompact: { width: "48.5%", flexGrow: 1 },
  smallActionText: { ...typeStyles.button },
  orderGroup: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingLeft: 11, paddingRight: 3, flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  orderLabel: { ...typeStyles.caption, marginRight: 3 },
  orderButton: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  empty: { borderWidth: 1, borderRadius: 20, padding: 32, alignItems: "center" },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 10 },
  emptyText: { ...typeStyles.bodyCompact, textAlign: "center", maxWidth: 460, marginTop: 6 },
  retry: { minHeight: 44, borderRadius: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 16 },
  skeletonHeader: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  skeletonMeta: { flexDirection: "row", gap: 18, marginTop: 18 },
  skeletonActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  previewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  previewSheet: { width: "100%", maxWidth: 700, maxHeight: "90%", borderRadius: 24, padding: 16 },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 },
  previewTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  previewHint: { ...typeStyles.caption, marginTop: 2 },
  closeButton: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
