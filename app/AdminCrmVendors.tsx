import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CheckSquare, Download, Edit3, Phone, Plus, RefreshCcw, Square, Trash2, UserCog, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { VendorCard } from "@/components/admin/crm/vendor/VendorCard";
import { StatusBottomSheet } from "@/components/admin/crm/vendor/StatusBottomSheet";
import { VendorEditorModal } from "@/components/admin/crm/vendor/VendorEditorModal";
import { useCrmVendors } from "@/hooks/crm/useCrmVendors";
import { CrmVendorService } from "@/services/crm/vendorService";
import { CrmExecutiveService } from "@/services/crm/executiveService";
import type { CrmSalesExecutive } from "@/types/crm/executive";
import type { CrmVendorInput, CrmVendorListItem, CrmVendorStatus } from "@/types/crm/vendor";

export default function AdminCrmVendors() {
  const router = useRouter();
  const { clusterId, clusterName, categoryId, categoryName } = useLocalSearchParams<{
    clusterId: string; clusterName?: string; categoryId: string; categoryName?: string;
  }>();
  const { filters, updateFilters, rows, total, loading, refreshing, error, setError, changeStatus, refresh } =
    useCrmVendors(clusterId ?? null, categoryId ?? null);

  const [menuVendor, setMenuVendor] = useState<CrmVendorListItem | null>(null);
  const [statusVendor, setStatusVendor] = useState<CrmVendorListItem | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<CrmVendorListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [executives, setExecutives] = useState<CrmSalesExecutive[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { void CrmExecutiveService.list().then(setExecutives).catch(() => setExecutives([])); }, []);

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openEditor = (vendor: CrmVendorListItem | null) => {
    setEditingVendor(vendor);
    setFormError(null);
    setEditorOpen(true);
  };

  const saveVendor = async (input: CrmVendorInput) => {
    setSaving(true);
    setFormError(null);
    try {
      if (editingVendor) await CrmVendorService.update(editingVendor.id, input);
      else await CrmVendorService.create(input);
      setEditorOpen(false);
      await refresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to save vendor.");
    } finally {
      setSaving(false);
    }
  };

  const callVendor = (vendor: CrmVendorListItem) => {
    if (!vendor.phone) return;
    void Linking.openURL(`tel:${vendor.phone}`);
  };

  const selectStatus = async (status: CrmVendorStatus) => {
    if (!statusVendor) return;
    setStatusSaving(true);
    try {
      await changeStatus(statusVendor.id, status);
      setStatusVendor(null);
    } catch {
      // error surfaced via hook's error state
    } finally {
      setStatusSaving(false);
    }
  };

  const runBulkStatus = async (status: CrmVendorStatus) => {
    setBulkSaving(true);
    try {
      await CrmVendorService.bulkUpdateStatus(Array.from(selected), status);
      setBulkStatusOpen(false);
      setSelected(new Set());
      setSelectionMode(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update selected vendors.");
    } finally {
      setBulkSaving(false);
    }
  };

  const runBulkAssign = async (executiveId: string | null) => {
    setBulkSaving(true);
    try {
      await CrmVendorService.bulkAssignExecutive(Array.from(selected), executiveId);
      setBulkAssignOpen(false);
      setSelected(new Set());
      setSelectionMode(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign selected vendors.");
    } finally {
      setBulkSaving(false);
    }
  };

  const runBulkDelete = async () => {
    setBulkSaving(true);
    try {
      await CrmVendorService.bulkDelete(Array.from(selected));
      setBulkDeleteOpen(false);
      setSelected(new Set());
      setSelectionMode(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete selected vendors.");
    } finally {
      setBulkSaving(false);
    }
  };

  const exportRows = async (subset: CrmVendorListItem[]) => {
    setExporting(true);
    try {
      await CrmVendorService.exportCsv(subset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to export vendors.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrm"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>{categoryName || "Vendors"}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{clusterName} · {total} vendors</Text>
        </View>
        <Pressable
          accessibilityLabel={selectionMode ? "Exit selection" : "Select vendors"}
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={toggleSelectionMode}
        >
          {selectionMode ? <X size={19} className="text-foreground" /> : <CheckSquare size={19} className="text-primary" />}
        </Pressable>
        <Pressable
          accessibilityLabel="Export vendors"
          disabled={exporting}
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => void exportRows(rows)}
        >
          {exporting ? <ActivityIndicator size="small" color="#E91E63" /> : <Download size={19} className="text-primary" />}
        </Pressable>
        <Pressable
          accessibilityLabel="Add vendor"
          className="min-w-11 min-h-11 items-center justify-center rounded-full bg-primary"
          onPress={() => openEditor(null)}
        >
          <Plus size={19} color="#FFFFFF" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: selectionMode && selected.size ? 190 : 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <ResponsiveSection>
            <CrmSearchBar value={filters.query} placeholder="Search business, owner, phone, area" onChangeText={(query) => updateFilters({ query })} />
          </ResponsiveSection>

          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => { setError(null); void refresh(); }} /></ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={4} />
            ) : !rows.length ? (
              <AdminEmptyState
                title={total ? "No vendors match your search" : "No vendors yet"}
                message={total ? "Try a different search term." : "Tap + to add the first vendor in this cluster and category."}
              />
            ) : (
              <View className="gap-3">
                {rows.map((vendor) => (
                  <VendorCard
                    key={vendor.id}
                    vendor={vendor}
                    selectionMode={selectionMode}
                    selected={selected.has(vendor.id)}
                    onToggleSelect={() => toggleSelect(vendor.id)}
                    onPress={() => router.push({ pathname: "/AdminCrmVendorProfile", params: { vendorId: vendor.id } })}
                    onLongPress={() => openEditor(vendor)}
                    onMenu={() => setMenuVendor(vendor)}
                  />
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />

      {selectionMode && selected.size ? (
        <View className="absolute left-0 right-0 bottom-16 bg-card border-t border-border px-4 py-3">
          <ResponsiveContainer>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-foreground text-xs font-bold">{selected.size} selected</Text>
              <Pressable onPress={() => void exportRows(rows.filter((row) => selected.has(row.id)))}>
                <Text className="text-primary text-xs font-bold">Export selected</Text>
              </Pressable>
            </View>
            <View className="flex-row gap-2">
              <Pressable onPress={() => setBulkStatusOpen(true)} className="flex-1 h-11 rounded-2xl bg-primary/10 items-center justify-center flex-row">
                <RefreshCcw size={14} className="text-primary" />
                <Text className="text-primary text-metadata font-bold ml-1.5">Status</Text>
              </Pressable>
              <Pressable onPress={() => setBulkAssignOpen(true)} className="flex-1 h-11 rounded-2xl bg-primary/10 items-center justify-center flex-row">
                <UserCog size={14} className="text-primary" />
                <Text className="text-primary text-metadata font-bold ml-1.5">Assign</Text>
              </Pressable>
              <Pressable onPress={() => setBulkDeleteOpen(true)} className="flex-1 h-11 rounded-2xl items-center justify-center flex-row" style={{ backgroundColor: "#FEE2E2" }}>
                <Trash2 size={14} color="#DC3545" />
                <Text className="text-metadata font-bold ml-1.5" style={{ color: "#DC3545" }}>Delete</Text>
              </Pressable>
            </View>
          </ResponsiveContainer>
        </View>
      ) : null}

      <Modal visible={menuVendor !== null} transparent animationType="slide" onRequestClose={() => setMenuVendor(null)}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setMenuVendor(null)}>
          <Pressable className="bg-card rounded-t-3xl p-5" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground text-lg font-bold" numberOfLines={1}>{menuVendor?.business_name}</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setMenuVendor(null)}><X size={20} className="text-foreground" /></Pressable>
            </View>
            <Pressable
              disabled={!menuVendor?.phone}
              onPress={() => { if (menuVendor) callVendor(menuVendor); setMenuVendor(null); }}
              className="flex-row items-center min-h-14 px-2"
              style={{ opacity: menuVendor?.phone ? 1 : 0.4 }}
            >
              <Phone size={18} className="text-primary" />
              <Text className="text-foreground text-sm font-semibold ml-3">Call vendor</Text>
            </Pressable>
            <Pressable
              onPress={() => { setStatusVendor(menuVendor); setMenuVendor(null); }}
              className="flex-row items-center min-h-14 px-2 border-t border-border"
            >
              <RefreshCcw size={18} className="text-primary" />
              <Text className="text-foreground text-sm font-semibold ml-3">Change status</Text>
            </Pressable>
            <Pressable
              onPress={() => { openEditor(menuVendor); setMenuVendor(null); }}
              className="flex-row items-center min-h-14 px-2 border-t border-border"
            >
              <Edit3 size={18} className="text-primary" />
              <Text className="text-foreground text-sm font-semibold ml-3">Edit vendor</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <StatusBottomSheet
        visible={statusVendor !== null}
        current={statusVendor?.status ?? null}
        saving={statusSaving}
        onSelect={(status) => void selectStatus(status)}
        onClose={() => setStatusVendor(null)}
      />

      <StatusBottomSheet
        visible={bulkStatusOpen}
        current={null}
        saving={bulkSaving}
        onSelect={(status) => void runBulkStatus(status)}
        onClose={() => setBulkStatusOpen(false)}
      />

      <Modal visible={bulkAssignOpen} transparent animationType="slide" onRequestClose={() => setBulkAssignOpen(false)}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setBulkAssignOpen(false)}>
          <Pressable className="bg-card rounded-t-3xl p-5" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground text-lg font-bold">Assign Executive</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setBulkAssignOpen(false)}><X size={20} className="text-foreground" /></Pressable>
            </View>
            <Pressable disabled={bulkSaving} onPress={() => void runBulkAssign(null)} className="flex-row items-center min-h-14 px-2">
              <Square size={16} className="text-muted-foreground" />
              <Text className="text-foreground text-sm font-semibold ml-3">Unassigned</Text>
            </Pressable>
            {executives.map((executive) => (
              <Pressable key={executive.id} disabled={bulkSaving} onPress={() => void runBulkAssign(executive.id)} className="flex-row items-center min-h-14 px-2 border-t border-border">
                <UserCog size={16} className="text-primary" />
                <Text className="text-foreground text-sm font-semibold ml-3">{executive.name}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={bulkDeleteOpen} transparent animationType="fade" onRequestClose={() => setBulkDeleteOpen(false)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !bulkSaving && setBulkDeleteOpen(false)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card items-center" onPress={(event) => event.stopPropagation()}>
            <Text className="text-foreground text-lg font-bold text-center">Delete {selected.size} vendors?</Text>
            <Text className="text-muted-foreground text-xs text-center mt-2">This removes their notes, follow-ups and activity history. This cannot be undone.</Text>
            <View className="flex-row gap-3 mt-5 w-full">
              <Pressable disabled={bulkSaving} onPress={() => setBulkDeleteOpen(false)} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center">
                <Text className="text-foreground text-sm font-bold">Cancel</Text>
              </Pressable>
              <Pressable disabled={bulkSaving} onPress={() => void runBulkDelete()} className="flex-1 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: "#DC3545" }}>
                {bulkSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Delete</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <VendorEditorModal
        visible={editorOpen}
        clusterId={clusterId ?? ""}
        defaultCategoryId={categoryId ?? null}
        vendor={editingVendor}
        saving={saving}
        error={formError}
        onSave={saveVendor}
        onClose={() => setEditorOpen(false)}
      />
    </SafeAreaView>
  );
}
