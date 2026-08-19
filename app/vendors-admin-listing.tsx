import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch,
  Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Archive, BadgeCheck, BadgeX, Clock3, Download, Eye, PauseCircle, PlayCircle,
  RotateCcw, Trash2, UserCheck, UserX, X,
  type LucideIcon,
} from "lucide-react-native";
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
import type { AdminVendorRecord, VendorAction, VendorFilters, VendorSort } from "@/types/adminVendors";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { AdminEmptyState, AdminErrorState, AdminRefreshIndicator, AdminTableSkeleton } from "@/components/admin/ui/AdminState";
import { ActionProgress } from "@/components/admin/ui/ActionProgress";
import { UndoToast } from "@/components/admin/ui/UndoToast";
import { AdminPreferences, type SavedVendorFilter } from "@/services/adminPreferences";
import {
  getVendorRegistrationEnabled,
  setVendorRegistrationEnabled,
} from "@/services/vendorRegistration";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";

// DESIGN.md "Quiet Dashboard Lift": 0 8px 18px rgba(125,61,88,0.05) — the
// documented restrained shadow for admin cards over the workspace canvas.
const cardLiftShadow = {
  shadowColor: "#7D3D58",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.05,
  shadowRadius: 18,
  elevation: 2,
} as const;

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
  const [registrationEnabled, setRegistrationEnabledState] = useState<boolean | null>(null);
  const [registrationSaving, setRegistrationSaving] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const exportCancelled = useRef(false);
  const pageCount = Math.max(1, Math.ceil(vendors.total / vendors.filters.pageSize));
  useEffect(() => { void AdminPreferences.listVendorFilters().then(setSavedFilters); }, []);
  useEffect(() => {
    let active = true;
    getVendorRegistrationEnabled()
      .then((enabled) => { if (active) setRegistrationEnabledState(enabled); })
      .catch(() => { if (active) setRegistrationError("Unable to load vendor registration status."); });
    return () => { active = false; };
  }, []);
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

  const updateRegistration = async (enabled: boolean) => {
    if (registrationSaving || registrationEnabled === null) return;
    setRegistrationSaving(true);
    setRegistrationError("");
    try {
      const saved = await setVendorRegistrationEnabled(enabled);
      setRegistrationEnabledState(saved);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : "Unable to update vendor registration.");
      Alert.alert("Vendor registration", "The setting could not be saved. Try again.");
    } finally {
      setRegistrationSaving(false);
    }
  };

  const beginAction = (next: ManagementOperation, record?: AdminVendorRecord) => {
    if (record) setActionRecord(record);
    setOperation(next);
    setActionMenuOpen(false);
  };
  const targets = actionRecord ? [actionRecord] : [];

  const confirmAction = async (reason?: string) => {
    const selected = targets;
    const currentOperation = operation;
    if (!currentOperation || selected.length === 0) return;
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          <AdminPageHeader
            title="Vendor Management"
            subtitle="Review vendor access, profiles and registration"
            action={(
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Export filtered vendors"
                accessibilityState={{ disabled: exporting, busy: exporting }}
                className="min-w-11 min-h-11 rounded-xl border border-border bg-card items-center justify-center active:bg-muted"
                style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined}
                disabled={exporting}
                onPress={() => void exportFilteredVendors()}
              >
                {exporting ? <ActivityIndicator size="small" color="#E91E63" /> : <Download size={20} className="text-primary" />}
              </Pressable>
            )}
          />
        </ResponsiveContainer>

        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          <ResponsiveSection>
            <View className="bg-card border border-border rounded-2xl px-5 py-5 flex-row items-center gap-4">
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2">
                  <Text className="text-foreground text-base font-bold">Vendor Registration</Text>
                  {registrationEnabled !== null ? (
                    <View className={`rounded-full px-2.5 py-1 ${registrationEnabled ? "bg-green-500/10" : "bg-muted"}`}>
                      <Text className={`text-xs font-bold ${registrationEnabled ? "text-green-700" : "text-muted-foreground"}`}>
                        {registrationEnabled ? "ON" : "OFF"}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className={`text-sm leading-5 mt-1 ${registrationError ? "text-destructive" : "text-muted-foreground"}`}>
                  {registrationError || (registrationEnabled === null
                    ? "Checking the current registration setting…"
                    : registrationEnabled
                      ? "New vendors can register through the app."
                      : "New vendor registrations are temporarily disabled.")}
                </Text>
              </View>
              {registrationEnabled === null ? (
                <ActivityIndicator color="#E91E63" />
              ) : (
                <Switch
                  accessibilityLabel="Vendor Registration"
                  accessibilityHint="Controls whether new vendors can register through the app"
                  accessibilityState={{ checked: registrationEnabled, disabled: registrationSaving, busy: registrationSaving }}
                  value={registrationEnabled}
                  disabled={registrationSaving}
                  onValueChange={(value) => void updateRegistration(value)}
                  trackColor={{ false: "#D6D1D4", true: "#F5A6C2" }}
                  thumbColor={registrationEnabled ? "#E91E63" : "#FFFFFF"}
                />
              )}
            </View>
          </ResponsiveSection>
        </ResponsiveContainer>

        {vendors.statistics && vendors.statistics.pending > 0 && vendors.filters.status !== "pending" ? (
          <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
            <ResponsiveSection>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Review ${vendors.statistics.pending} pending vendor application${vendors.statistics.pending === 1 ? "" : "s"}`}
                className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 flex-row items-center gap-4"
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                onPress={() => vendors.updateFilters({ status: "pending", page: 1 })}
              >
                <View className="w-11 h-11 rounded-2xl bg-amber-500/15 items-center justify-center">
                  <Clock3 size={20} color="#B45309" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-base font-bold">
                    {vendors.statistics.pending} vendor{vendors.statistics.pending === 1 ? "" : "s"} waiting for review
                  </Text>
                  <Text className="text-muted-foreground text-sm mt-0.5">
                    Tap to jump to pending applications and approve or reject them.
                  </Text>
                </View>
                <Text className="text-amber-700 font-bold text-sm">Review now</Text>
              </Pressable>
            </ResponsiveSection>
          </ResponsiveContainer>
        ) : null}

        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          {vendors.statistics ? (
            <ResponsiveSection>
              <VendorStatisticsGrid
                data={vendors.statistics}
                activeStatus={vendors.filters.status}
                onSelectStatus={(status) => vendors.updateFilters({ status, page: 1 })}
              />
            </ResponsiveSection>
          ) : null}
        </ResponsiveContainer>
        <ResponsiveContainer className="bg-background pt-1" style={{ maxWidth: 1600, alignSelf: "center" }}>
          <ResponsiveSection>
            <View className="bg-card border border-border rounded-2xl p-4">
            <VendorFilterBar filters={vendors.filters} onChange={vendors.updateFilters} onMore={() => setFiltersOpen(true)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {savedFilters.map((preset) => <Pressable key={preset.id} className="min-h-11 px-4 rounded-xl border border-border bg-background items-center justify-center" style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={() => vendors.updateFilters(preset.filters)}><Text className="text-foreground text-xs font-semibold">{preset.name}</Text></Pressable>)}
              <Pressable className="min-h-11 px-4 rounded-xl bg-primary/10 items-center justify-center" style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={() => setSaveOpen(true)}><Text className="text-primary text-xs font-semibold">+ Save filter</Text></Pressable>
            </ScrollView>
            </View>
          </ResponsiveSection>
          {progress ? <ResponsiveSection><ActionProgress {...progress} /></ResponsiveSection> : null}

        </ResponsiveContainer>

        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-foreground font-bold">{vendors.total.toLocaleString()} vendors</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export filtered vendors"
              accessibilityState={{ disabled: exporting, busy: exporting }}
              className="min-h-11 px-3 rounded-xl items-center justify-center active:bg-primary/5"
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
                      onView={() => router.push({ pathname: "/AdminVendorDetails", params: { id: item.record_id } })}
                      onActions={() => { setActionRecord(item); setActionMenuOpen(true); }}
                      onApprove={() => beginAction("approve", item)}
                      onReject={() => beginAction("reject", item)}
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
  const standardActions = actions.filter((action) => action !== "archive" && action !== "soft_delete");
  const destructiveActions = actions.filter((action) => action === "archive" || action === "soft_delete");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 items-center justify-center px-4 py-8">
        <Pressable accessibilityLabel="Close vendor actions" className="absolute inset-0" onPress={onClose} />
        <View className="bg-card border border-border rounded-3xl p-5 w-full max-w-lg" style={{ maxHeight: "92%" }}>
          <View className="flex-row items-start gap-3">
            <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
              <Text className="text-primary font-bold">{record.business_name.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View className="flex-1 min-w-0 pt-0.5">
              <Text className="text-foreground text-lg font-bold" numberOfLines={1}>{record.business_name}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">Vendor management actions</Text>
            </View>
            <Pressable accessibilityLabel="Close" className="min-w-11 min-h-11 -mr-2 -mt-2 rounded-xl items-center justify-center" onPress={onClose}>
              <X size={20} className="text-muted-foreground" />
            </Pressable>
          </View>

          <Pressable className="min-h-12 mt-5 rounded-2xl bg-primary flex-row items-center justify-center gap-2" style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })} onPress={onView}>
            <Eye size={18} color="#FFFFFF" />
            <Text className="text-white font-bold">View vendor profile</Text>
          </Pressable>

          <Text className="text-muted-foreground text-xs font-semibold mt-5 mb-2">ACCOUNT ACTIONS</Text>
          <View className="flex-row flex-wrap gap-2">
            {standardActions.map((action) => <ActionButton key={action} action={action} onPress={() => onAction(action)} />)}
          </View>

          {destructiveActions.length ? (
            <View className="border-t border-border mt-5 pt-4">
              <Text className="text-red-600 text-xs font-semibold mb-2">RESTRICTED ACTIONS</Text>
              <View className="flex-row flex-wrap gap-2">
                {destructiveActions.map((action) => <ActionButton key={action} action={action} destructive onPress={() => onAction(action)} />)}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const actionIcons: Record<ManagementOperation, LucideIcon> = {
  approve: UserCheck,
  reject: UserX,
  suspend: PauseCircle,
  activate: PlayCircle,
  verify: BadgeCheck,
  unverify: BadgeX,
  archive: Archive,
  restore: RotateCcw,
  soft_delete: Trash2,
};

function ActionIcon({ action, size, color }: { action: ManagementOperation; size: number; color: string }) {
  const Icon = actionIcons[action];
  return <Icon size={size} color={color} />;
}

function ActionButton({ action, destructive = false, onPress }: { action: ManagementOperation; destructive?: boolean; onPress: () => void }) {
  const label = action.replace("_", " ");
  const color = destructive ? "#DC2626" : "#1F191C";
  return (
    <Pressable
      accessibilityLabel={`${label} vendor`}
      className={`min-h-12 min-w-[47%] flex-1 px-3 rounded-2xl border flex-row items-center justify-center gap-2 ${destructive ? "border-red-200 bg-red-50" : "border-border bg-background"}`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
      onPress={onPress}
    >
      <ActionIcon action={action} size={18} color={color} />
      <Text className={`font-semibold capitalize ${destructive ? "text-red-600" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}

type FilterModalCategory = { id: string; name: string };

type FilterModalProps = {
  visible: boolean;
  onClose: () => void;
  onApply: (values: Partial<VendorFilters>) => void;
  categories: FilterModalCategory[];
  filters: VendorFilters;
  city: string;
  state: string;
  setCity: (value: string) => void;
  setState: (value: string) => void;
};

function FilterModal({ visible, onClose, onApply, categories, filters, city, state, setCity, setState }: FilterModalProps) {
  const [categoryId, setCategoryId] = useState<string | null>(filters.categoryId);
  const [verification, setVerification] = useState(filters.verification);
  const [plan, setPlan] = useState(filters.plan);
  const [sort, setSort] = useState<VendorSort>(filters.sort);
  const categoryOptions = React.useMemo(() => [{ id: "all", name: "All categories" }, ...categories.map((category) => ({ id: category.id, name: category.name }))], [categories]);
  const selectedCategoryName = categoryOptions.find((category) => category.id === (categoryId ?? "all"))?.name;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View className="flex-1 bg-black/60 justify-end"><View className="bg-card rounded-t-3xl p-5 max-h-[88%]"><View className="flex-row justify-between items-center mb-4"><Text className="text-foreground text-xl font-bold">Filters & Sorting</Text><Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={onClose}><X size={21} className="text-foreground" /></Pressable></View><ScrollView showsVerticalScrollIndicator={false}>
    <Label text="Verification" /><ChoiceRow items={["all", "verified", "unverified"]} value={verification} onChange={setVerification} />
    <Label text="Plan" /><ChoiceRow items={["all", "premium", "free"]} value={plan} onChange={setPlan} />
    <View className="mt-4"><HierarchySelect label="Category" value={selectedCategoryName} options={categoryOptions} selectedId={categoryId ?? "all"} onSelect={(id) => setCategoryId(id === "all" ? null : id)} /></View>
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
