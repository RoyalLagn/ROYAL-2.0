import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowDown, ArrowUp, CircleDollarSign, Eye, PackagePlus, Pencil, Power, RefreshCw, Trash2, X } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useVendorPackages } from "@/hooks/useVendorPackages";
import PackageEditorModal from "@/components/packages/PackageEditorModal";
import PackageDisplayCard, { packagePriceLabel } from "@/components/packages/PackageDisplayCard";
import { VendorPackageService, type VendorPackage, type VendorPackageInput, type VendorPackageStatus } from "@/services/vendorPackages";
import { SkeletonBone, SkeletonLines } from "@/components/loading/Skeleton";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";

export default function VendorServices() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const dark = colorScheme === "dark";
  const { data } = useVendorWorkspace();
  const vendorId = data.vendor?.id as string | undefined;
  const { packages, loading, error, refresh } = useVendorPackages(vendorId, false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<VendorPackage | null>(null);
  const [preview, setPreview] = useState<VendorPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openEditor = (item: VendorPackage | null = null) => { setEditing(item); setEditorOpen(true); };
  const save = async (input: VendorPackageInput) => {
    if (!vendorId || saving) return;
    setSaving(true);
    try {
      await VendorPackageService.save(input, editing?.id);
      setEditorOpen(false);
      setEditing(null);
      await refresh();
      Alert.alert(input.status === "draft" ? "Draft saved" : "Package saved", input.status === "active" ? "Customers can now see this package." : "The package is saved but hidden from customers.");
    } catch (cause) { Alert.alert("Package not saved", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setSaving(false); }
  };
  const changeStatus = async (item: VendorPackage, status: VendorPackageStatus) => {
    if (!vendorId || busyId) return;
    setBusyId(item.id);
    try { await VendorPackageService.setStatus(item.id, vendorId, status); await refresh(true); }
    catch (cause) { Alert.alert("Package not updated", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusyId(null); }
  };
  const remove = (item: VendorPackage) => Alert.alert("Delete package?", `${item.title} and its included service items will be permanently removed. Existing enquiries keep the package name.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => {
      if (!vendorId || busyId) return;
      setBusyId(item.id);
      try { await VendorPackageService.remove(item.id, vendorId); await refresh(true); }
      catch (cause) { Alert.alert("Package not deleted", cause instanceof Error ? cause.message : "Please try again."); }
      finally { setBusyId(null); }
    } },
  ]);
  const move = async (index: number, direction: -1 | 1) => {
    if (!vendorId || busyId) return;
    const target = index + direction;
    if (target < 0 || target >= packages.length) return;
    const ordered = packages.map((item) => item.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusyId(packages[index].id);
    try { await VendorPackageService.reorder(vendorId, ordered); await refresh(true); }
    catch (cause) { Alert.alert("Order not updated", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusyId(null); }
  };

  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heading}><View style={styles.flex}><Text style={[styles.eyebrow, { color: colors.pink }]}>DIGITAL PACKAGES</Text><Text style={[styles.title, { color: colors.text }]}>Packages & pricing</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Create clear packages, publish the ones customers can book and keep drafts private.</Text></View><Pressable disabled={!vendorId} onPress={() => openEditor()} style={[styles.primary, { backgroundColor: colors.pink }, !vendorId && styles.disabled]}><PackagePlus size={18} color="#FFF" /><Text style={styles.primaryText}>New package</Text></Pressable></View>
      <View style={styles.summary}><Summary label="Total" value={packages.length} colors={colors} /><Summary label="Active" value={packages.filter((item) => item.status === "active").length} colors={colors} /><Summary label="Drafts" value={packages.filter((item) => item.status === "draft").length} colors={colors} /><Pressable accessibilityLabel="Refresh packages" onPress={() => void refresh()} style={[styles.refresh, { backgroundColor: colors.surface, borderColor: colors.border }]}><RefreshCw size={17} color={colors.pink} /></Pressable></View>

      {loading ? <View style={{ gap: 10 }}>{[0, 1, 2].map((index) => (
        <View key={index} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SkeletonBone width={43} height={43} radius={14} />
          <View style={styles.flex}>
            <SkeletonLines lines={2} gap={7} lastLineWidth="70%" />
            <View style={{ flexDirection: "row", gap: 6, marginTop: 11 }}>
              <SkeletonBone width={70} height={20} radius={11} />
              <SkeletonBone width={70} height={20} radius={11} />
            </View>
          </View>
        </View>
      ))}</View> : null}
      {!loading && error ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.text }]}>Packages unavailable</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{error}</Text><Pressable onPress={() => void refresh()} style={[styles.retry, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Try again</Text></Pressable></View> : null}
      {!loading && !error && !packages.length ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><PackagePlus size={31} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Create your first package</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Add pricing, coverage and included services once, then customers can enquire about that exact package.</Text><Pressable onPress={() => openEditor()} style={[styles.retry, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Create package</Text></Pressable></View> : null}

      {!loading && !error ? packages.map((item, index) => <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={[styles.packageIcon, { backgroundColor: colors.surfaceSoft }]}><CircleDollarSign size={21} color={colors.pink} /></View>
        <View style={styles.flex}><View style={styles.nameRow}><Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{item.title}</Text><Status status={item.status} colors={colors} /></View><Text numberOfLines={2} style={[styles.description, { color: colors.muted }]}>{item.description || "No package description yet."}</Text><View style={styles.meta}><Text style={[styles.price, { color: colors.text }]}>{packagePriceLabel(item)}</Text><Text style={[styles.metaText, { color: colors.muted }]}>{item.items.filter((entry) => entry.item_type === "included").length} included · Position {index + 1}</Text></View>
          <View style={styles.actions}><SmallAction label="Preview" icon={Eye} onPress={() => setPreview(item)} colors={colors} /><SmallAction label="Edit" icon={Pencil} onPress={() => openEditor(item)} colors={colors} /><SmallAction label={item.status === "active" ? "Deactivate" : "Activate"} icon={Power} onPress={() => void changeStatus(item, item.status === "active" ? "inactive" : "active")} colors={colors} /><SmallAction label="Delete" icon={Trash2} onPress={() => remove(item)} colors={colors} danger /></View>
        </View>
        <View style={styles.order}><Pressable disabled={index === 0 || Boolean(busyId)} accessibilityLabel={`Move ${item.title} up`} onPress={() => void move(index, -1)} style={[styles.orderButton, { backgroundColor: colors.surfaceSoft }, index === 0 && styles.disabled]}><ArrowUp size={15} color={colors.text} /></Pressable><Pressable disabled={index === packages.length - 1 || Boolean(busyId)} accessibilityLabel={`Move ${item.title} down`} onPress={() => void move(index, 1)} style={[styles.orderButton, { backgroundColor: colors.surfaceSoft }, index === packages.length - 1 && styles.disabled]}><ArrowDown size={15} color={colors.text} /></Pressable>{busyId === item.id ? <ActivityIndicator size="small" color={colors.pink} /> : null}</View>
      </View>) : null}
    </ScrollView>

    <PackageEditorModal visible={editorOpen} vendorId={vendorId ?? ""} item={editing} dark={dark} saving={saving} onClose={() => { if (!saving) { setEditorOpen(false); setEditing(null); } }} onSave={(input) => void save(input)} />
    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}><View style={styles.previewBackdrop}><View style={[styles.previewSheet, { backgroundColor: colors.background }]}><View style={styles.previewHeader}><View style={styles.flex}><Text style={[styles.previewTitle, { color: colors.text }]}>Customer preview</Text><Text style={[styles.previewHint, { color: colors.muted }]}>This is how your package information will appear.</Text></View><Pressable accessibilityLabel="Close preview" onPress={() => setPreview(null)} style={[styles.orderButton, { backgroundColor: colors.surfaceSoft }]}><X size={19} color={colors.text} /></Pressable></View><ScrollView showsVerticalScrollIndicator={false}>{preview ? <PackageDisplayCard item={preview} dark={dark} preview /> : null}</ScrollView></View></View></Modal>
  </View>;
}

function Summary({ label, value, colors }: any) { return <View style={[styles.summaryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text></View>; }
function Status({ status, colors }: { status: VendorPackageStatus; colors: any }) { const tint = status === "active" ? colors.success : status === "draft" ? colors.warning : colors.muted; return <View style={[styles.status, { backgroundColor: `${tint}18` }]}><Text style={[styles.statusText, { color: tint }]}>{status.toUpperCase()}</Text></View>; }
function SmallAction({ label, icon: Icon, onPress, colors, danger }: any) {
  return (
    <View style={[styles.smallActionVisual, { backgroundColor: colors.surfaceSoft }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        android_ripple={{ color: "rgba(233,30,99,0.08)" }}
        onPress={onPress}
        style={styles.smallActionHitArea}
      >
        <Icon size={14} color={danger ? colors.warning : colors.pink} />
        <Text style={[styles.smallActionText, { color: danger ? colors.warning : colors.text }]}>{label}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 980, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 36 }, heading: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 }, flex: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.5, marginBottom: 5 }, title: { ...typeStyles.pageTitle }, subtitle: { ...typeStyles.metadata, marginTop: 4, maxWidth: 560 }, primary: { minHeight: 44, borderRadius: 14, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 7 }, primaryText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" }, summary: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 16 }, summaryItem: { minWidth: 92, flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 13 }, summaryValue: { ...typeStyles.sectionTitle }, summaryLabel: { ...typeStyles.caption, marginTop: 2 }, refresh: { width: 48, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" }, loading: { marginTop: 50 }, empty: { borderWidth: 1, borderRadius: 23, padding: 34, alignItems: "center" }, emptyTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 10 }, emptyText: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center", maxWidth: 460, marginTop: 5 }, retry: { minHeight: 42, borderRadius: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 14 }, card: { borderWidth: 1, borderRadius: 22, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 11, shadowOpacity: .045, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 1 }, packageIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, nameRow: { flexDirection: "row", alignItems: "center", gap: 8 }, name: { flex: 1, fontSize: typeScale.body, fontWeight: "700" }, status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, statusText: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: .4 }, description: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 4 }, meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9, marginTop: 8 }, price: { fontSize: typeScale.bodyCompact, fontWeight: "700" }, metaText: { fontSize: typeScale.caption }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 }, smallActionVisual: { height: 36, overflow: "hidden", borderRadius: 11 }, smallActionHitArea: { height: 36, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 }, smallActionText: { fontSize: typeScale.caption, fontWeight: "700" }, order: { gap: 6, alignItems: "center" }, orderButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, disabled: { opacity: .4 }, pressed: { opacity: .72, transform: [{ scale: .97 }] }, previewBackdrop: { flex: 1, backgroundColor: "rgba(12,7,10,.58)", alignItems: "center", justifyContent: "center", padding: 18 }, previewSheet: { width: "100%", maxWidth: 700, maxHeight: "90%", borderRadius: 26, padding: 16 }, previewHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 }, previewTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" }, previewHint: { fontSize: typeScale.caption, marginTop: 2 },
});
