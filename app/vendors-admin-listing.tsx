import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Modal, Pressable, ScrollView,
  Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Download, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { useAdminVendors } from "@/hooks/useAdminVendors";
import { VendorStatisticsGrid } from "@/components/admin/vendors/VendorStatisticsGrid";
import { VendorFilterBar } from "@/components/admin/vendors/VendorFilterBar";
import { VendorCard } from "@/components/admin/vendors/VendorCard";
import {
  VendorActionDialog,
  type ManagementOperation,
} from "@/components/admin/vendors/VendorActionDialog";
import { AdminVendorService } from "@/services/adminVendorService";
import type { AdminVendorRecord, VendorAction, VendorSort } from "@/types/adminVendors";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { AdminEmptyState, AdminErrorState, AdminRefreshIndicator, AdminTableSkeleton } from "@/components/admin/ui/AdminState";
import { ActionProgress } from "@/components/admin/ui/ActionProgress";
import { UndoToast } from "@/components/admin/ui/UndoToast";
import { AdminPreferences, type SavedVendorFilter } from "@/services/adminPreferences";

const sorts: { value: VendorSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "business_az", label: "Business A–Z" },
  { value: "business_za", label: "Business Z–A" },
  { value: "category", label: "Category" },
  { value: "registration_date", label: "Registration Date" },
  { value: "recently_updated", label: "Recently Updated" },
];

export default function VendorsAdminListing() {
  const router = useRouter();
  const vendors = useAdminVendors();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionRecord, setActionRecord] = useState<AdminVendorRecord | null>(null);
  const [operation, setOperation] = useState<ManagementOperation | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [progress, setProgress] = useState<{ completed: number; total: number; label: string } | null>(null);
  const [undo, setUndo] = useState<{ records: AdminVendorRecord[]; action: VendorAction; message: string } | null>(null);
  const [savedFilters, setSavedFilters] = useState<SavedVendorFilter[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportCancelled = useRef(false);
  const pageCount = Math.max(1, Math.ceil(vendors.total / vendors.filters.pageSize));
  useEffect(() => { void AdminPreferences.listVendorFilters().then(setSavedFilters); }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 7000);
    return () => clearTimeout(timer);
  }, [undo]);
  // Stop a still-paginating export from continuing to fetch pages (and
  // eventually calling exportCsv on a screen the admin already left) once
  // this screen unmounts.
  useEffect(() => () => { exportCancelled.current = true; }, []);

  const exportFilteredVendors = async () => {
    if (exporting) return;
    exportCancelled.current = false;
    setExporting(true);
    setExportProgress(0);
    try {
      await AdminVendorService.exportFiltered(vendors.filters, {
        onProgress: (loaded) => setExportProgress(loaded),
        isCancelled: () => exportCancelled.current,
      });
    } catch (error) {
      Alert.alert("Export failed", error instanceof Error ? error.message : "Unable to export vendors. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const beginAction = (next: ManagementOperation, record?: AdminVendorRecord) => {
    if (record) setActionRecord(record);
    setOperation(next);
    setActionMenuOpen(false);
  };
  const targets = actionRecord ? [actionRecord] : vendors.selectedRows;

  const confirmAction = async (reason?: string) => {
    const selected = targets;
    const currentOperation = operation;
    if (!currentOperation) return;
    const rollback = vendors.optimisticPatch(
      selected.map((record) => record.record_id),
      optimisticValues(currentOperation),
    );
    setOperation(null);
    setProgress({ completed: 0, total: selected.length, label: `${currentOperation.replace("_", " ")} vendors` });
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const record = selected[index];
        if (currentOperation === "approve" || currentOperation === "reject") {
          await AdminVendorService.review(
            record,
            currentOperation === "approve" ? "approved" : "rejected",
            reason,
          );
        } else {
          await AdminVendorService.action(record, currentOperation as VendorAction, reason);
        }
        setProgress({ completed: index + 1, total: selected.length, label: `${currentOperation.replace("_", " ")} vendors` });
      }
      setActionRecord(null);
      vendors.clearSelected();
      const reverse = reverseAction(currentOperation);
      if (reverse) setUndo({ records: selected, action: reverse, message: `${selected.length} vendor${selected.length === 1 ? "" : "s"} updated` });
      await vendors.refresh();
      Alert.alert("Vendor management", `${selected.length} vendor${selected.length === 1 ? "" : "s"} updated.`);
    } catch (error) {
      rollback();
      Alert.alert("Action failed", error instanceof Error ? error.message : "Unable to update vendor.");
    } finally {
      setProgress(null);
    }
  };

  const undoAction = async () => {
    if (!undo) return;
    const current = undo;
    setUndo(null);
    setProgress({ completed: 0, total: current.records.length, label: "Undoing changes" });
    try {
      for (let index = 0; index < current.records.length; index += 1) {
        await AdminVendorService.action(current.records[index], current.action);
        setProgress({ completed: index + 1, total: current.records.length, label: "Undoing changes" });
      }
      await vendors.refresh();
    } catch (error) {
      Alert.alert("Undo failed", error instanceof Error ? error.message : "Unable to undo this action.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[2]}>
        <ResponsiveContainer>
          <AdminPageHeader title="Vendor Management" subtitle="Live vendor operations workspace" action={<Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={() => void AdminVendorService.exportCsv(vendors.rows)}><Download size={20} className="text-primary" /></Pressable>} />
        </ResponsiveContainer>

        <ResponsiveContainer>
          {vendors.statistics ? <ResponsiveSection><VendorStatisticsGrid data={vendors.statistics} /></ResponsiveSection> : null}
        </ResponsiveContainer>
        <ResponsiveContainer className="bg-background pt-1">
          {vendors.statistics ? <View className="flex-row gap-2 mb-2">
            <View className="flex-1 bg-card border border-border rounded-xl p-2"><Text className="text-foreground font-bold">{vendors.statistics.total}</Text><Text className="text-muted-foreground text-[10px]">Total</Text></View>
            <View className="flex-1 bg-card border border-border rounded-xl p-2"><Text className="text-amber-500 font-bold">{vendors.statistics.pending}</Text><Text className="text-muted-foreground text-[10px]">Pending</Text></View>
            <View className="flex-1 bg-card border border-border rounded-xl p-2"><Text className="text-red-500 font-bold">{vendors.statistics.suspended}</Text><Text className="text-muted-foreground text-[10px]">Suspended</Text></View>
          </View> : null}
          <ResponsiveSection>
            <VendorFilterBar filters={vendors.filters} categories={vendors.categories} onChange={vendors.updateFilters} onMore={() => setFiltersOpen(true)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {savedFilters.map((preset) => <Pressable key={preset.id} className="min-h-11 px-4 rounded-full bg-card border border-border items-center justify-center" onPress={() => vendors.updateFilters(preset.filters)}><Text className="text-foreground text-xs font-semibold">{preset.name}</Text></Pressable>)}
              <Pressable className="min-h-11 px-4 rounded-full bg-primary/10 items-center justify-center" onPress={() => setSaveOpen(true)}><Text className="text-primary text-xs font-semibold">+ Save filter</Text></Pressable>
            </ScrollView>
          </ResponsiveSection>
          {progress ? <ResponsiveSection><ActionProgress {...progress} /></ResponsiveSection> : null}

          {vendors.selected.size ? (
            <ResponsiveSection>
              <View className="bg-card border border-primary/30 rounded-2xl p-3">
                <Text className="text-foreground font-semibold">{vendors.selected.size} selected</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
                  {(["approve", "reject", "suspend", "activate", "archive", "restore"] as ManagementOperation[]).map((action) => (
                    <Pressable key={action} className="min-h-11 px-4 rounded-full bg-primary/10 items-center justify-center" onPress={() => beginAction(action)}>
                      <Text className="text-primary text-xs font-semibold capitalize">{action}</Text>
                    </Pressable>
                  ))}
                  <Pressable className="min-h-11 px-4 rounded-full bg-primary items-center justify-center" onPress={() => void AdminVendorService.exportCsv(vendors.selectedRows)}>
                    <Text className="text-white text-xs font-semibold">Export</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </ResponsiveSection>
          ) : null}
        </ResponsiveContainer>

        <ResponsiveContainer>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-foreground font-bold">{vendors.total.toLocaleString()} vendors</Text>
            <Pressable
              className="min-h-11 px-3 items-center justify-center"
              disabled={exporting}
              onPress={() => void exportFilteredVendors()}
            >
              <Text className="text-primary text-xs font-semibold">
                {exporting ? `Exporting… ${exportProgress.toLocaleString()}` : "Export filtered"}
              </Text>
            </Pressable>
          </View>

          {vendors.loading ? <AdminTableSkeleton />
            : vendors.error ? <AdminErrorState message={vendors.error} onRetry={() => void vendors.refresh()} />
              : !vendors.rows.length ? <AdminEmptyState title="No vendors found" message="Adjust the search or filters to find matching vendor records." />
                : <>
                  {vendors.refreshing ? <AdminRefreshIndicator label="Updating vendor list…" /> : null}
                  <View className="gap-3">{vendors.rows.map((item) => (
                    <VendorCard
                      key={item.record_id}
                      item={item}
                      selected={vendors.selected.has(item.record_id)}
                      onSelect={() => vendors.toggle(item.record_id)}
                      onView={() => router.push({ pathname: "/AdminVendorDetails", params: { id: item.record_id } })}
                      onActions={() => { setActionRecord(item); setActionMenuOpen(true); }}
                      health={item.vendor_id ? vendors.health[item.vendor_id] : undefined}
                    />
                  ))}</View>
                </>}

          <PaginationBar page={vendors.filters.page} pages={pageCount} onPage={(page) => vendors.updateFilters({ page })} />
        </ResponsiveContainer>
      </ScrollView>

      <FilterModal
        visible={filtersOpen}
        city={city}
        state={state}
        setCity={setCity}
        setState={setState}
        onClose={() => setFiltersOpen(false)}
        onApply={(values) => { vendors.updateFilters(values); setFiltersOpen(false); }}
        categories={vendors.categories}
        filters={vendors.filters}
      />
      <ActionMenu visible={actionMenuOpen} record={actionRecord} onClose={() => setActionMenuOpen(false)} onView={() => { setActionMenuOpen(false); if (actionRecord) router.push({ pathname: "/AdminVendorDetails", params: { id: actionRecord.record_id } }); }} onAction={beginAction} />
      <VendorActionDialog visible={Boolean(operation)} operation={operation} records={targets} onCancel={() => { setOperation(null); setActionRecord(null); }} onConfirm={confirmAction} />
      <SaveFilterModal visible={saveOpen} name={presetName} setName={setPresetName} onClose={() => setSaveOpen(false)} onSave={async () => { if (!presetName.trim()) return; setSavedFilters(await AdminPreferences.saveVendorFilter(presetName, vendors.filters)); setPresetName(""); setSaveOpen(false); }} />
      {undo ? <UndoToast message={undo.message} onUndo={() => void undoAction()} /> : null}
      <AdminFooter activeTab="vendors" />
    </SafeAreaView>
  );
}

function ActionMenu({ visible, record, onClose, onView, onAction }: { visible: boolean; record: AdminVendorRecord | null; onClose: () => void; onView: () => void; onAction: (action: ManagementOperation) => void }) {
  if (!record) return null;
  const actions: ManagementOperation[] = record.vendor_id
    ? ["suspend", "activate", record.is_verified ? "unverify" : "verify", "archive", "restore", "soft_delete"]
    : ["approve", "reject"];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><Pressable className="flex-1 bg-black/60 justify-end" onPress={onClose}><View className="bg-card border-t border-border rounded-t-3xl p-5"><Text className="text-foreground text-lg font-bold mb-3" numberOfLines={1}>{record.business_name}</Text><Pressable className="min-h-11 justify-center border-b border-border" onPress={onView}><Text className="text-primary font-semibold">View profile</Text></Pressable>{actions.map((action) => <Pressable key={action} className="min-h-11 justify-center border-b border-border" onPress={() => onAction(action)}><Text className={`font-semibold capitalize ${action === "archive" || action === "soft_delete" ? "text-red-500" : "text-foreground"}`}>{action.replace("_", " ")}</Text></Pressable>)}</View></Pressable></Modal>;
}

function FilterModal({ visible, onClose, onApply, categories, filters, city, state, setCity, setState }: any) {
  const [categoryId, setCategoryId] = useState<string | null>(filters.categoryId);
  const [verification, setVerification] = useState(filters.verification);
  const [plan, setPlan] = useState(filters.plan);
  const [sort, setSort] = useState<VendorSort>(filters.sort);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View className="flex-1 bg-black/60 justify-end"><View className="bg-card rounded-t-3xl p-5 max-h-[88%]"><View className="flex-row justify-between items-center mb-4"><Text className="text-foreground text-xl font-bold">Filters & Sorting</Text><Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={onClose}><X size={21} className="text-foreground" /></Pressable></View><ScrollView showsVerticalScrollIndicator={false}>
    <Label text="Verification" /><ChoiceRow items={["all", "verified", "unverified"]} value={verification} onChange={setVerification} />
    <Label text="Plan" /><ChoiceRow items={["all", "premium", "free"]} value={plan} onChange={setPlan} />
    <Label text="Category" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Choice value={categoryId === null} label="All" onPress={() => setCategoryId(null)} />{categories.map((category: any) => <Choice key={category.id} value={categoryId === category.id} label={category.name} onPress={() => setCategoryId(category.id)} />)}</ScrollView>
    <Label text="City" /><TextInput className="h-12 bg-background border border-border rounded-xl px-4 text-foreground" value={city} onChangeText={setCity} placeholder="Any city" placeholderTextColor="#8A8589" />
    <Label text="State" /><TextInput className="h-12 bg-background border border-border rounded-xl px-4 text-foreground" value={state} onChangeText={setState} placeholder="Any state" placeholderTextColor="#8A8589" />
    <Label text="Sort" /><ChoiceRow items={sorts.map((item) => item.value)} labels={Object.fromEntries(sorts.map((item) => [item.value, item.label]))} value={sort} onChange={setSort} />
    <Pressable className="bg-primary min-h-12 rounded-2xl items-center justify-center mt-6" onPress={() => onApply({ verification, plan, categoryId, city: city.trim() || null, state: state.trim() || null, sort })}><Text className="text-white font-bold">Apply Filters</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
function Label({ text }: { text: string }) { return <Text className="text-foreground font-semibold mt-4 mb-2">{text}</Text>; }
function ChoiceRow({ items, labels = {}, value, onChange }: any) { return <View className="flex-row flex-wrap gap-2">{items.map((item: string) => <Choice key={item} value={value === item} label={labels[item] || item} onPress={() => onChange(item)} />)}</View>; }
function Choice({ value, label, onPress }: { value: boolean; label: string; onPress: () => void }) { return <Pressable className={`min-h-11 px-4 rounded-full items-center justify-center border ${value ? "bg-primary border-primary" : "bg-background border-border"}`} onPress={onPress}><Text className={`text-xs font-semibold capitalize ${value ? "text-white" : "text-foreground"}`}>{label}</Text></Pressable>; }
function optimisticValues(action: ManagementOperation): Partial<AdminVendorRecord> {
  if (action === "approve") return { application_status: "approved", is_verified: true };
  if (action === "reject") return { application_status: "rejected" };
  if (action === "suspend") return { management_status: "suspended" };
  if (action === "activate" || action === "restore") return { management_status: "active" };
  if (action === "archive" || action === "soft_delete") return { management_status: "archived" };
  if (action === "verify") return { is_verified: true };
  if (action === "unverify") return { is_verified: false };
  return {};
}
function reverseAction(action: ManagementOperation): VendorAction | null {
  if (action === "suspend") return "activate";
  if (action === "archive" || action === "soft_delete") return "restore";
  if (action === "restore") return "archive";
  return null;
}
function SaveFilterModal({ visible, name, setName, onClose, onSave }: { visible: boolean; name: string; setName: (value: string) => void; onClose: () => void; onSave: () => Promise<void> }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View className="flex-1 bg-black/60 items-center justify-center px-5"><View className="bg-card border border-border rounded-3xl p-5 w-full max-w-lg"><Text className="text-foreground text-xl font-bold">Save Filter Preset</Text><TextInput className="h-12 bg-background border border-border rounded-xl px-4 text-foreground mt-4" placeholder="Preset name" placeholderTextColor="#8A8589" value={name} onChangeText={setName} /><View className="flex-row gap-3 mt-4"><Pressable className="flex-1 min-h-11 border border-border rounded-xl items-center justify-center" onPress={onClose}><Text className="text-foreground font-semibold">Cancel</Text></Pressable><Pressable className="flex-1 min-h-11 bg-primary rounded-xl items-center justify-center" onPress={() => void onSave()}><Text className="text-white font-semibold">Save</Text></Pressable></View></View></View></Modal>;
}
