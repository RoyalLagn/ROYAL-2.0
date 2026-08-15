import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  Check,
  ChevronDown,
  Send,
  X,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminPushNotificationService } from "@/services/adminPushNotifications";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import type { AdminVendorRecord } from "@/types/adminVendors";
import {
  PUSH_DESTINATION_PRESETS,
  type PushAudience,
  type PushCampaign,
} from "@/types/pushNotifications";
import { typeScale } from "@/constants/typography";
import { adminPalette } from "@/theme";

const PINK = adminPalette.brand;

type Draft = {
  title: string;
  message: string;
  audience: PushAudience;
  vendorCategoryId: string;
  vendorCategoryName: string;
  targetVendorId: string;
  targetVendorLabel: string;
  destinationMode: "preset" | "category" | "custom";
  presetPath: string;
  categorySlug: string;
  customPath: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  message: "",
  audience: "customers",
  vendorCategoryId: "",
  vendorCategoryName: "",
  targetVendorId: "",
  targetVendorLabel: "",
  destinationMode: "preset",
  presetPath: "",
  categorySlug: "",
  customPath: "",
});

const AUDIENCE_OPTIONS: { value: PushAudience; label: string; hint: string }[] = [
  { value: "customers", label: "Customers only", hint: "All public app users" },
  { value: "vendors", label: "All vendors", hint: "Every vendor account" },
  { value: "everyone", label: "Everyone", hint: "Customers and vendors" },
  {
    value: "vendor",
    label: "Specific Vendor",
    hint: "Filter by category, then choose one vendor",
  },
];

function errorMessage(reason: unknown) {
  if (reason instanceof Error && reason.message) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Something went wrong.");
  }
  return "Something went wrong.";
}

function statusColor(status: string) {
  if (status === "sent") return "#059669";
  if (status === "partial") return "#D97706";
  if (status === "failed") return "#DC2626";
  return "#6B7280";
}

function resolveTargetPath(draft: Draft) {
  if (draft.destinationMode === "category" && draft.categorySlug) {
    return `/VendorsListing?category=${encodeURIComponent(draft.categorySlug)}`;
  }
  if (draft.destinationMode === "custom") return draft.customPath.trim();
  return draft.presetPath.trim();
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function vendorDisplayName(vendor: AdminVendorRecord) {
  return vendor.business_name || vendor.owner_name || "Vendor";
}

function vendorSecondaryLine(vendor: AdminVendorRecord) {
  const parts = [
    vendor.category_name || "Uncategorized",
    vendor.email,
    vendor.phone,
    vendor.vendor_id,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function AdminPushNotifications() {
  const [campaigns, setCampaigns] = useState<PushCampaign[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorResults, setVendorResults] = useState<AdminVendorRecord[]>([]);
  const [vendorSearching, setVendorSearching] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [vendorReloadKey, setVendorReloadKey] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const [nextCampaigns, nextCategories] = await Promise.all([
        AdminPushNotificationService.listCampaigns(true),
        CategoryService.list({ force: isRefresh }),
      ]);
      setCampaigns(nextCampaigns);
      setCategories(nextCategories);
      if (!nextCategories.length) {
        setCategoriesError("No vendor categories found in Supabase.");
      }
    } catch (reason) {
      setError(errorMessage(reason));
      setCategoriesError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => AdminPushNotificationService.subscribe(() => void load(true)), [load]);

  useEffect(() => {
    if (draft.audience !== "vendor") {
      setVendorResults([]);
      setVendorError(null);
      setVendorSearching(false);
      return;
    }

    let active = true;
    setVendorSearching(true);
    setVendorError(null);
    const timer = setTimeout(() => {
      AdminPushNotificationService.searchVendors({
        query: vendorQuery,
        categoryId: draft.vendorCategoryId || null,
        pageSize: 50,
      })
        .then((rows) => {
          if (!active) return;
          setVendorResults(rows);
        })
        .catch((reason) => {
          if (!active) return;
          setVendorResults([]);
          setVendorError(errorMessage(reason));
        })
        .finally(() => {
          if (active) setVendorSearching(false);
        });
    }, vendorQuery.trim() ? 280 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft.audience, draft.vendorCategoryId, vendorQuery, vendorReloadKey]);

  const audienceLabel = useMemo(() => {
    if (draft.audience === "vendor") {
      return draft.targetVendorLabel || "One specific vendor";
    }
    return AUDIENCE_OPTIONS.find((item) => item.value === draft.audience)?.label ?? draft.audience;
  }, [draft.audience, draft.targetVendorLabel]);

  const selectVendorCategory = (category: CategoryRecord | null) => {
    setDraft((current) => ({
      ...current,
      vendorCategoryId: category?.id ?? "",
      vendorCategoryName: category?.name ?? "",
      targetVendorId: "",
      targetVendorLabel: "",
    }));
    setVendorQuery("");
    setVendorResults([]);
    setVendorError(null);
    setCategoryPickerOpen(false);
  };

  const validate = () => {
    if (!draft.title.trim()) return "Enter a notification title.";
    if (!draft.message.trim()) return "Enter a notification message.";
    if (draft.audience === "vendor" && !draft.targetVendorId) {
      return "Select a specific vendor before sending.";
    }
    if (draft.destinationMode === "category" && !draft.categorySlug) {
      return "Select a category destination, or choose No destination.";
    }
    return null;
  };

  const openConfirm = () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const send = async () => {
    setSaving(true);
    setError(null);
    try {
      await AdminPushNotificationService.send({
        title: draft.title,
        message: draft.message,
        imageUrl: null,
        audience: draft.audience,
        targetVendorId: draft.audience === "vendor" ? draft.targetVendorId : null,
        targetPath: resolveTargetPath(draft) || null,
      });
      setConfirmOpen(false);
      setDraft(emptyDraft());
      setVendorQuery("");
      setVendorResults([]);
      setVendorError(null);
      await load(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={PINK} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Push Notifications"
            subtitle="Send announcements to customers and vendors"
          />

          {error ? (
            <View className="mb-4">
              <AdminErrorState message={error} onRetry={() => setError(null)} />
            </View>
          ) : null}

          <View className="bg-card border border-border rounded-3xl p-4 mb-5">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-2xl bg-primary/10 items-center justify-center">
                <Bell size={18} color={PINK} />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-foreground text-base font-bold">Compose notification</Text>
                <Text className="text-muted-foreground text-xs mt-1">
                  Delivers in-app inbox messages and Expo push where tokens exist
                </Text>
              </View>
            </View>

            <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
              Audience
            </Text>
            <View className="gap-2 mb-4">
              {AUDIENCE_OPTIONS.map((option) => {
                const selected = draft.audience === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setDraft((current) => ({
                        ...current,
                        audience: option.value,
                        vendorCategoryId: option.value === "vendor" ? current.vendorCategoryId : "",
                        vendorCategoryName: option.value === "vendor" ? current.vendorCategoryName : "",
                        targetVendorId: option.value === "vendor" ? current.targetVendorId : "",
                        targetVendorLabel: option.value === "vendor" ? current.targetVendorLabel : "",
                      }));
                      if (option.value !== "vendor") {
                        setVendorQuery("");
                        setVendorResults([]);
                        setVendorError(null);
                        setCategoryPickerOpen(false);
                      }
                    }}
                    className="min-h-12 px-3 rounded-2xl border flex-row items-center"
                    style={{
                      borderColor: selected ? PINK : "#E7D7DE",
                      backgroundColor: selected ? "#FFF0F6" : "transparent",
                    }}
                  >
                    <View
                      className="w-5 h-5 rounded-full border items-center justify-center mr-3"
                      style={{ borderColor: selected ? PINK : "#C4B4BB" }}
                    >
                      {selected ? <View className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground text-sm font-semibold">{option.label}</Text>
                      <Text className="text-muted-foreground text-metadata">{option.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {draft.audience === "vendor" ? (
              <View className="mb-4">
                <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
                  Vendor Category
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select vendor category"
                  onPress={() => setCategoryPickerOpen((open) => !open)}
                  className="min-h-12 px-4 rounded-2xl border border-border bg-background flex-row items-center mb-3"
                >
                  <Text
                    className={
                      draft.vendorCategoryName
                        ? "flex-1 text-foreground text-sm font-semibold"
                        : "flex-1 text-muted-foreground text-sm"
                    }
                  >
                    {draft.vendorCategoryName || "All categories"}
                  </Text>
                  <ChevronDown size={16} className="text-muted-foreground" />
                </Pressable>

                {categoryPickerOpen ? (
                  <View className="mb-3 border border-border rounded-2xl overflow-hidden bg-background max-h-56">
                    {categoriesLoading ? (
                      <View className="py-6 items-center">
                        <ActivityIndicator color={PINK} />
                        <Text className="text-muted-foreground text-xs mt-2">Loading categories…</Text>
                      </View>
                    ) : categoriesError ? (
                      <View className="p-3">
                        <AdminErrorState
                          message={categoriesError}
                          onRetry={() => void load(true)}
                        />
                      </View>
                    ) : !categories.length ? (
                      <View className="p-3">
                        <AdminEmptyState
                          title="No categories"
                          message="Vendor categories could not be loaded from Supabase."
                        />
                      </View>
                    ) : (
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <Pressable
                          onPress={() => selectVendorCategory(null)}
                          className="min-h-11 px-3 rounded-xl flex-row items-center"
                          style={{
                            backgroundColor: !draft.vendorCategoryId ? "#FFF0F6" : "transparent",
                          }}
                        >
                          <Text className="text-foreground text-sm flex-1">All categories</Text>
                          {!draft.vendorCategoryId ? <Check size={14} color={PINK} /> : null}
                        </Pressable>
                        {categories.map((category) => {
                          const selected = draft.vendorCategoryId === category.id;
                          return (
                            <Pressable
                              key={category.id}
                              onPress={() => selectVendorCategory(category)}
                              className="min-h-11 px-3 rounded-xl flex-row items-center"
                              style={{ backgroundColor: selected ? "#FFF0F6" : "transparent" }}
                            >
                              <Text className="text-foreground text-sm flex-1" numberOfLines={1}>
                                {category.name}
                              </Text>
                              {selected ? <Check size={14} color={PINK} /> : null}
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                ) : null}

                <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
                  Find vendor
                </Text>
                <TextInput
                  value={vendorQuery}
                  onChangeText={(value) => {
                    setVendorQuery(value);
                    if (draft.targetVendorId) {
                      setDraft((current) => ({
                        ...current,
                        targetVendorId: "",
                        targetVendorLabel: "",
                      }));
                    }
                  }}
                  placeholder="Name, business, email, phone, vendor ID, or category"
                  placeholderTextColor="#9A8A90"
                  className="min-h-12 px-4 rounded-2xl border border-border bg-background text-foreground text-sm"
                />
                {draft.targetVendorLabel ? (
                  <View className="mt-2 px-3 py-2 rounded-xl bg-primary/10 flex-row items-center">
                    <Check size={14} color={PINK} />
                    <Text className="text-foreground text-xs font-semibold ml-2 flex-1">
                      {draft.targetVendorLabel}
                    </Text>
                    <Pressable
                      onPress={() => setDraft((current) => ({
                        ...current,
                        targetVendorId: "",
                        targetVendorLabel: "",
                      }))}
                    >
                      <X size={14} className="text-muted-foreground" />
                    </Pressable>
                  </View>
                ) : null}

                {draft.targetVendorId && !vendorQuery.trim() ? null : vendorSearching ? (
                  <View className="py-3 items-center">
                    <ActivityIndicator color={PINK} />
                    <Text className="text-muted-foreground text-xs mt-2">Loading vendors…</Text>
                  </View>
                ) : vendorError ? (
                  <View className="mt-2">
                    <AdminErrorState
                      message={vendorError}
                      onRetry={() => setVendorReloadKey((key) => key + 1)}
                    />
                  </View>
                ) : !vendorResults.length ? (
                  draft.targetVendorId ? null : (
                    <View className="mt-2 px-3 py-4 rounded-2xl border border-border bg-background">
                      <Text className="text-foreground text-sm font-semibold text-center">
                        No vendors found
                      </Text>
                      <Text className="text-muted-foreground text-xs text-center mt-1">
                        {draft.vendorCategoryName
                          ? `No vendors in “${draft.vendorCategoryName}” match this search.`
                          : "Try another name, email, phone, vendor ID, or category."}
                      </Text>
                    </View>
                  )
                ) : (
                  <View className="mt-2 gap-1 max-h-64">
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {vendorResults.map((vendor) => {
                        const selected = draft.targetVendorId === vendor.vendor_id;
                        const name = vendorDisplayName(vendor);
                        const categoryLabel = vendor.category_name || "Uncategorized";
                        return (
                          <Pressable
                            key={vendor.record_id}
                            onPress={() => {
                              setDraft((current) => ({
                                ...current,
                                targetVendorId: vendor.vendor_id || "",
                                targetVendorLabel: `${name} · ${categoryLabel}`,
                              }));
                              setVendorQuery("");
                              setVendorResults([]);
                            }}
                            className="min-h-11 px-3 rounded-xl bg-background border border-border justify-center mb-1"
                            style={{
                              borderColor: selected ? PINK : undefined,
                              backgroundColor: selected ? "#FFF0F6" : undefined,
                            }}
                          >
                            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                              {name}
                            </Text>
                            <Text className="text-muted-foreground text-metadata" numberOfLines={1}>
                              {vendorSecondaryLine(vendor)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            ) : null}

            <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
              Title
            </Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
              placeholder="Notification title"
              placeholderTextColor="#9A8A90"
              className="min-h-12 px-4 rounded-2xl border border-border bg-background text-foreground text-sm mb-4"
            />

            <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
              Message
            </Text>
            <TextInput
              value={draft.message}
              onChangeText={(message) => setDraft((current) => ({ ...current, message }))}
              placeholder="Write the notification message"
              placeholderTextColor="#9A8A90"
              multiline
              textAlignVertical="top"
              className="min-h-28 px-4 py-3 rounded-2xl border border-border bg-background text-foreground text-sm mb-4"
            />

            <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
              Destination
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {([
                ["preset", "Preset screen"],
                ["category", "Category listing"],
                ["custom", "Custom path"],
              ] as const).map(([mode, label]) => {
                const selected = draft.destinationMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setDraft((current) => ({ ...current, destinationMode: mode }))}
                    className="px-3 min-h-11 rounded-full border items-center justify-center"
                    style={{
                      borderColor: selected ? PINK : "#E7D7DE",
                      backgroundColor: selected ? "#FFF0F6" : "transparent",
                    }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: selected ? PINK : "#6B7280" }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {draft.destinationMode === "preset" ? (
              <View className="gap-1 mb-4">
                {PUSH_DESTINATION_PRESETS.map((preset) => {
                  const selected = draft.presetPath === preset.value;
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => setDraft((current) => ({ ...current, presetPath: preset.value }))}
                      className="min-h-11 px-3 rounded-xl flex-row items-center"
                      style={{ backgroundColor: selected ? "#FFF0F6" : "transparent" }}
                    >
                      <Text className="text-foreground text-sm flex-1">{preset.label}</Text>
                      {selected ? <Check size={14} color={PINK} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {draft.destinationMode === "category" ? (
              <View className="gap-1 mb-4 max-h-56">
                {categoriesLoading ? (
                  <View className="py-4 items-center">
                    <ActivityIndicator color={PINK} />
                  </View>
                ) : categoriesError ? (
                  <AdminErrorState message={categoriesError} onRetry={() => void load(true)} />
                ) : !categories.length ? (
                  <AdminEmptyState
                    title="No categories"
                    message="Add marketplace categories before using category destinations."
                  />
                ) : (
                  <ScrollView nestedScrollEnabled>
                    {categories.map((category) => {
                      const selected = draft.categorySlug === category.slug;
                      return (
                        <Pressable
                          key={category.id}
                          onPress={() => setDraft((current) => ({ ...current, categorySlug: category.slug }))}
                          className="min-h-11 px-3 rounded-xl flex-row items-center"
                          style={{ backgroundColor: selected ? "#FFF0F6" : "transparent" }}
                        >
                          <Text className="text-foreground text-sm flex-1">{category.name}</Text>
                          {selected ? <Check size={14} color={PINK} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {draft.destinationMode === "custom" ? (
              <TextInput
                value={draft.customPath}
                onChangeText={(customPath) => setDraft((current) => ({ ...current, customPath }))}
                placeholder="/VendorsProfile or /(tabs)/Categories"
                placeholderTextColor="#9A8A90"
                className="min-h-12 px-4 rounded-2xl border border-border bg-background text-foreground text-sm mb-4"
              />
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={openConfirm}
              className="min-h-12 rounded-2xl bg-primary flex-row items-center justify-center gap-2"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              <Send size={16} color="#FFFFFF" />
              <Text className="text-white text-sm font-bold">Send notification</Text>
            </Pressable>
          </View>

          <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
            Send history
          </Text>
          {loading ? (
            <AdminLoadingState label="Loading campaigns…" />
          ) : !campaigns.length ? (
            <AdminEmptyState
              title="No campaigns yet"
              message="Sent notifications will appear here with audience and delivery counts."
            />
          ) : (
            <View className="gap-3">
              {campaigns.map((campaign) => (
                <View key={campaign.id} className="bg-card border border-border rounded-2xl p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                        {campaign.title}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>
                        {campaign.message}
                      </Text>
                    </View>
                    <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${statusColor(campaign.status)}22` }}>
                      <Text style={{ color: statusColor(campaign.status), fontSize: typeScale.caption, fontWeight: "700" }}>
                        {campaign.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-muted-foreground text-metadata mt-3">
                    Audience: {campaign.audience}
                    {campaign.target_path ? ` · ${campaign.target_path}` : ""}
                  </Text>
                  <Text className="text-muted-foreground text-metadata mt-1">
                    Inbox {campaign.inbox_count} · Sent {campaign.sent_count} · Failed {campaign.failed_count}
                  </Text>
                  <Text className="text-muted-foreground text-metadata mt-1">
                    {formatWhen(campaign.created_at)}
                  </Text>
                  {campaign.error_summary ? (
                    <Text className="text-red-500 text-metadata mt-2">{campaign.error_summary}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>

      <AdminFooter activeTab="profile" />

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => !saving && setConfirmOpen(false)}>
        <Pressable className="flex-1 p-5 items-center justify-center bg-black/50" onPress={() => !saving && setConfirmOpen(false)}>
          <Pressable className="w-full max-w-md rounded-3xl p-5 bg-card" onPress={(event) => event.stopPropagation()}>
            <Text className="text-foreground text-lg font-bold">Send this notification?</Text>
            <Text className="text-muted-foreground text-sm mt-2 leading-5">
              “{draft.title.trim()}” will be sent to {audienceLabel}. Recipients get an inbox item immediately; devices with a registered push token also receive an Expo notification.
            </Text>
            {resolveTargetPath(draft) ? (
              <Text className="text-muted-foreground text-xs mt-3">
                Opens: {resolveTargetPath(draft)}
              </Text>
            ) : null}
            <View className="flex-row gap-3 mt-5">
              <Pressable
                disabled={saving}
                onPress={() => setConfirmOpen(false)}
                className="flex-1 min-h-12 rounded-2xl border border-border items-center justify-center"
              >
                <Text className="text-foreground text-sm font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() => void send()}
                className="flex-1 min-h-12 rounded-2xl bg-primary items-center justify-center"
                style={{ opacity: saving ? 0.65 : 1 }}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white text-sm font-bold">Confirm send</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
