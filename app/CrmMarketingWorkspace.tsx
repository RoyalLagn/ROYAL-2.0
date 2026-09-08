import React from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Check, ChevronRight, Phone, ShieldAlert, X } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { useMarketingWorkspaceSession } from "@/hooks/crm/useMarketingWorkspaceSession";
import { useMarketingWorkspaceVendors } from "@/hooks/crm/useMarketingWorkspaceVendors";
import { CrmMarketingWorkspaceSessionService } from "@/services/crm/marketingWorkspaceSessionService";
import type { CrmMarketingWorkspaceProgressUpdate, CrmMarketingWorkspaceVendorListItem, MarketingInterestStatus } from "@/types/crm/marketingWorkspace";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import PageLoader from "@/components/loading/PageLoader";

const interestFilters: { key: "all" | MarketingInterestStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "interested", label: "Interested" },
  { key: "not_interested", label: "Not Interested" },
];

export default function CrmMarketingWorkspace() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isPhone } = useResponsiveLayout();
  const scrollRef = React.useRef<ScrollView>(null);
  const vendorSectionY = React.useRef(0);
  const [selectedVendor, setSelectedVendor] = React.useState<CrmMarketingWorkspaceVendorListItem | null>(null);
  const [savingAction, setSavingAction] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const { session, progress, loading, error, refresh, refreshProgress } = useMarketingWorkspaceSession(token ?? null);
  const {
    query, setQuery, interestFilter, setInterestFilter, rows, total, loading: vendorsLoading,
    page, setPage, pageSize, refreshing, error: vendorsError, setError: setVendorsError, refresh: refreshVendors,
  } = useMarketingWorkspaceVendors(token ?? null, Boolean(session));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const goToPage = React.useCallback((nextPage: number) => {
    const boundedPage = Math.max(1, Math.min(pageCount, nextPage));
    if (boundedPage === page) return;
    setPage(boundedPage);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, vendorSectionY.current - 16), animated: true });
    });
  }, [page, pageCount, setPage]);

  // Re-pull progress + the vendor list every time this screen regains focus
  // — most notably when coming back from the vendor detail screen after a
  // Save, so "Overall Progress" and each vendor's pipeline badges reflect
  // the just-saved values immediately, without requiring a manual
  // pull-to-refresh. Uses the lightweight refreshProgress() (progress only)
  // rather than the full session refresh() (which re-authenticates), since
  // a focus event isn't a reason to re-validate the token.
  useFocusEffect(React.useCallback(() => {
    if (!session) return;
    void refreshProgress();
    void refreshVendors();
  }, [session, refreshProgress, refreshVendors]));

  const updateVendorStatus = React.useCallback(async (
    vendorId: string,
    update: CrmMarketingWorkspaceProgressUpdate,
  ) => {
    if (!token || savingAction) return;
    setSavingAction(vendorId);
    setActionError(null);
    try {
      await CrmMarketingWorkspaceSessionService.updateProgress(token, vendorId, update);
      await Promise.all([refreshVendors(), refreshProgress()]);
      setSelectedVendor(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to save this status. Please try again.");
    } finally {
      setSavingAction(null);
    }
  }, [token, savingAction, refreshVendors, refreshProgress]);

  if (loading) {
    return <PageLoader />;
  }

  if (error || !session) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <ShieldAlert size={40} color="#DC3545" />
        <Text className="text-foreground text-lg font-bold mt-4 text-center">This link isn&apos;t available</Text>
        <Text className="text-muted-foreground text-sm mt-2 text-center">{error || "Unable to open this workspace."}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); void refreshVendors(); }} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <ResponsiveSection>
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-widest mt-4">RoyalLagn Marketing Workspace</Text>
            <Text className="text-foreground text-2xl font-bold mt-1">{session.workspace_name}</Text>
            <Text className="text-muted-foreground text-sm mt-1">{session.team_name}</Text>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-foreground text-sm font-bold">Overall Progress</Text>
                <Text className="text-primary text-lg font-bold">{progress?.weighted_completion ?? 0}%</Text>
              </View>
              <View className="h-2.5 rounded-full bg-muted overflow-hidden">
                <View className="h-2.5 rounded-full bg-primary" style={{ width: `${progress?.weighted_completion ?? 0}%` }} />
              </View>
              <Text className="text-muted-foreground text-xs mt-3">
                {progress?.assigned ?? 0} vendors assigned · {progress?.contacted ?? 0} contacted · {progress?.meeting_done ?? 0} meetings · {progress?.interested ?? 0} interested · {progress?.registered ?? 0} registered
              </Text>
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CrmSearchBar value={query} placeholder="Search vendors" onChangeText={setQuery} />
          </ResponsiveSection>

          <ResponsiveSection>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {interestFilters.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setInterestFilter(item.key)}
                    className={`px-3 py-2 rounded-full border ${interestFilter === item.key ? "bg-primary border-primary" : "border-border"}`}
                  >
                    <Text className={`text-xs font-semibold ${interestFilter === item.key ? "text-white" : "text-foreground"}`}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </ResponsiveSection>

          {vendorsError ? (
            <ResponsiveSection><AdminErrorState message={vendorsError} onRetry={() => { setVendorsError(null); void refreshVendors(); }} /></ResponsiveSection>
          ) : null}

          <ResponsiveSection onLayout={(event) => { vendorSectionY.current = event.nativeEvent.layout.y; }}>
            {actionError ? (
              <View className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3" accessibilityLiveRegion="polite">
                <Text className="text-destructive text-sm font-semibold">{actionError}</Text>
              </View>
            ) : null}
            {vendorsLoading ? (
              <CrmSkeletonGrid count={4} />
            ) : !rows.length ? (
              <AdminEmptyState
                title={total ? "No vendors match your filters" : "No vendors assigned yet"}
                message={total ? "Try a different search or filter." : "Vendors assigned to this workspace by the admin will show up here."}
              />
            ) : (
              <View className="flex-row flex-wrap -m-1.5">
                {rows.map((vendor) => {
                  return (
                    <View key={vendor.assignment_id} className="p-1.5" style={{ width: isPhone ? "100%" : "50%" }}>
                    <CRMCard className="overflow-hidden h-full">
                      <Pressable
                        onPress={() => {
                          setSelectedVendor(vendor);
                          setActionError(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Update status for ${vendor.business_name}`}
                        className="min-h-12 p-4"
                        style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
                      >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 min-w-0 pr-2">
                          <Text className="text-foreground text-base font-bold" numberOfLines={1}>{vendor.business_name}</Text>
                          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                            {vendor.category_name ?? "Uncategorized"} · {vendor.area ?? "No location"}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                          {vendor.phone ? <Phone size={16} className="text-muted-foreground" /> : null}
                          <ChevronRight size={18} className="text-muted-foreground" />
                        </View>
                      </View>
                      <View className="flex-row flex-wrap gap-2 mt-3">
                        <StatusBadge label={vendor.interest_status === "pending" ? "Interest pending" : vendor.interest_status === "interested" ? "Interested" : "Not interested"} active={vendor.interest_status !== "pending"} />
                        <StatusBadge label={vendor.registered ? "Registered" : "Not registered"} active={vendor.registered} />
                      </View>
                      </Pressable>
                    </CRMCard>
                    </View>
                  );
                })}
              </View>
            )}

            {!vendorsLoading && total > pageSize ? (
              <PaginationBar page={page} pages={pageCount} onPage={goToPage} total={total} pageSize={pageSize} />
            ) : null}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>

      <VendorStatusModal
        vendor={selectedVendor}
        saving={Boolean(savingAction)}
        error={actionError}
        onClose={() => {
          if (savingAction) return;
          setSelectedVendor(null);
          setActionError(null);
        }}
        onUpdate={updateVendorStatus}
      />
    </SafeAreaView>
  );
}

function VendorStatusModal({
  vendor,
  saving,
  error,
  onClose,
  onUpdate,
}: {
  vendor: CrmMarketingWorkspaceVendorListItem | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onUpdate: (vendorId: string, update: CrmMarketingWorkspaceProgressUpdate) => Promise<void>;
}) {
  const [interestChoice, setInterestChoice] = React.useState<"interested" | "not_interested" | null>(null);
  const [registrationChoice, setRegistrationChoice] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setInterestChoice(null);
    setRegistrationChoice(null);
  }, [vendor?.vendor_id]);

  if (!vendor) return null;
  const save = () => onUpdate(vendor.vendor_id, {
    interestStatus: interestChoice ?? "pending",
    notInterestedReason: null,
    registered: registrationChoice ?? false,
  });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black/60 items-center justify-center px-4 py-8">
        <View className="w-full max-w-lg rounded-2xl bg-card p-5" accessibilityViewIsModal>
          <View className="flex-row items-start gap-3">
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-xl font-bold" numberOfLines={2}>{vendor.business_name}</Text>
              <Text className="text-muted-foreground text-sm mt-1" numberOfLines={2}>
                {vendor.category_name ?? "Uncategorized"} · {vendor.area ?? "No location"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-2">
                Current: {vendor.interest_status === "pending" ? "Interest pending" : vendor.interest_status === "interested" ? "Interested" : "Not interested"} · {vendor.registered ? "Registered" : "Not registered"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close vendor status popup"
              disabled={saving}
              onPress={onClose}
              className="h-12 w-12 rounded-xl bg-muted items-center justify-center"
              style={({ pressed }) => ({ opacity: saving ? 0.45 : pressed ? 0.72 : 1 })}
            >
              <X size={20} className="text-foreground" />
            </Pressable>
          </View>

          <View className="mt-5 mb-3">
            <Text className="text-foreground text-base font-bold">Update vendor status</Text>
            <Text className="text-muted-foreground text-xs mt-1">Tap a selected option again to clear it. Saving with no selection resets the status.</Text>
          </View>

          {error ? (
            <View className="mb-4 rounded-xl bg-destructive/10 px-3 py-3" accessibilityLiveRegion="polite">
              <Text className="text-destructive text-sm font-semibold">{error}</Text>
            </View>
          ) : null}

          <Text className="text-muted-foreground text-xs font-semibold mb-2">Interest</Text>
          <View className="flex-row gap-2 mb-5" accessibilityRole="radiogroup">
            <StatusAction label="Interested" selected={interestChoice === "interested"} disabled={saving} onPress={() => setInterestChoice((current) => current === "interested" ? null : "interested")} />
            <StatusAction label="Not Interested" selected={interestChoice === "not_interested"} disabled={saving} onPress={() => setInterestChoice((current) => current === "not_interested" ? null : "not_interested")} />
          </View>

          <Text className="text-muted-foreground text-xs font-semibold mb-2">Registration</Text>
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            <StatusAction label="Registered" selected={registrationChoice === true} disabled={saving} onPress={() => setRegistrationChoice((current) => current === true ? null : true)} />
            <StatusAction label="Not Registered" selected={registrationChoice === false} disabled={saving} onPress={() => setRegistrationChoice((current) => current === false ? null : false)} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save vendor status"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={() => void save()}
            className="min-h-12 rounded-xl bg-primary items-center justify-center mt-6"
            style={({ pressed }) => ({ opacity: saving ? 0.55 : pressed ? 0.78 : 1 })}
          >
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Save</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <View className={`rounded-full px-2.5 py-1 ${active ? "bg-emerald-500/10" : "bg-muted"}`}>
      <Text className={`text-metadata font-semibold ${active ? "text-emerald-600" : "text-muted-foreground"}`}>{label}</Text>
    </View>
  );
}

function StatusAction({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-1 min-h-12 rounded-xl border px-3 py-3 flex-row items-center justify-center ${selected ? "bg-primary border-primary" : "bg-card border-border"}`}
      style={({ pressed }) => ({ opacity: disabled ? 0.55 : pressed ? 0.78 : 1 })}
    >
      {selected ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
      <Text className={`text-xs font-bold ${selected ? "text-white ml-1.5" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}
