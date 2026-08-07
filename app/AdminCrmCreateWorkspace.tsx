import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Copy, Share2 } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmCampaignService } from "@/services/crm/campaignService";
import { CrmWorkspaceService } from "@/services/crm/workspaceService";
import { buildWorkspaceUrl, copyWorkspaceLink, shareWorkspaceLink } from "@/services/crm/workspaceShare";
import { defaultWorkspacePermissions, type CrmFieldWorkspace, type CrmWorkspacePermissions } from "@/types/crm/workspace";
import type { CrmCampaign } from "@/types/crm/campaign";

const expiryPresets = [
  { label: "24 Hours", hours: 24 },
  { label: "48 Hours", hours: 48 },
  { label: "7 Days", hours: 24 * 7 },
];

const advancedPermissions: { key: keyof CrmWorkspacePermissions; label: string }[] = [
  { key: "delete_vendors", label: "Delete Vendors" },
  { key: "export_data", label: "Export" },
  { key: "view_reports", label: "Reports" },
  { key: "view_analytics", label: "Analytics" },
  { key: "view_settings", label: "Settings" },
  { key: "vendor_approval", label: "Vendor Approval" },
  { key: "subscription_access", label: "Subscription" },
  { key: "other_clusters", label: "Other Clusters" },
];

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View className="mb-3">
      <Text className="text-foreground text-xs font-semibold mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        className="h-12 border border-border rounded-2xl px-4 text-foreground bg-background"
      />
    </View>
  );
}

export default function AdminCrmCreateWorkspace() {
  const router = useRouter();
  const { clusterId, clusterName } = useLocalSearchParams<{ clusterId: string; clusterName?: string }>();

  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([]);
  const [name, setName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [expiryHours, setExpiryHours] = useState(48);
  const [customExpiry, setCustomExpiry] = useState("");
  const [permissions, setPermissions] = useState<CrmWorkspacePermissions>(defaultWorkspacePermissions);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CrmFieldWorkspace | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { void CrmCampaignService.list().then(setCampaigns).catch(() => setCampaigns([])); }, []);

  const generate = async () => {
    if (!clusterId) { setError("Missing cluster."); return; }
    if (!name.trim() || !employeeName.trim()) { setError("Enter a workspace name and employee name."); return; }
    const expiresAt = customExpiry.trim()
      ? new Date(customExpiry.trim()).toISOString()
      : new Date(Date.now() + expiryHours * 3_600_000).toISOString();
    if (Number.isNaN(Date.parse(expiresAt))) { setError("Enter a valid custom expiry date."); return; }

    setSaving(true);
    setError(null);
    try {
      const workspace = await CrmWorkspaceService.create({
        name: name.trim(),
        employeeName: employeeName.trim(),
        employeePhone: employeePhone.trim() || null,
        clusterId,
        campaignId,
        expiresAt,
        permissions,
      });
      setCreated(workspace);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create workspace.");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!created) return;
    setSaving(true);
    try {
      setCreated(await CrmWorkspaceService.regenerateToken(created.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to regenerate the link.");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!created) return;
    try {
      await copyWorkspaceLink(created.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (reason) {
      Alert.alert("Copy failed", reason instanceof Error ? reason.message : "Unable to copy the link.");
    }
  };

  const shareLink = async () => {
    if (!created) return;
    try {
      await shareWorkspaceLink(created.token, created.name);
    } catch (reason) {
      Alert.alert("Share failed", reason instanceof Error ? reason.message : "Unable to share the link.");
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
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Create Workspace</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{clusterName}</Text>
        </View>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          {created ? (
            <ResponsiveSection>
              <CRMCard className="p-5 items-center">
                <Text className="text-foreground text-lg font-bold">Workspace Ready</Text>
                <Text className="text-muted-foreground text-xs mt-1 text-center">Share this link with {created.employee_name}. It only works for the {clusterName} cluster.</Text>
                <View className="mt-5 p-3 bg-white rounded-2xl">
                  <QRCode value={buildWorkspaceUrl(created.token)} size={180} />
                </View>
                <Text className="text-muted-foreground text-metadata mt-3 text-center" numberOfLines={2} selectable>
                  {buildWorkspaceUrl(created.token)}
                </Text>
                <View className="flex-row gap-3 mt-5 w-full">
                  <Pressable onPress={() => void copyLink()} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center flex-row">
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-primary" />}
                    <Text className="text-foreground text-xs font-bold ml-2">{copied ? "Copied" : "Copy Link"}</Text>
                  </Pressable>
                  <Pressable onPress={() => void shareLink()} className="flex-1 h-12 rounded-2xl bg-primary items-center justify-center flex-row">
                    <Share2 size={16} color="#FFFFFF" />
                    <Text className="text-white text-xs font-bold ml-2">Share Link</Text>
                  </Pressable>
                </View>
                <Pressable disabled={saving} onPress={() => void regenerate()} className="mt-3">
                  <Text className="text-red-500 text-xs font-semibold">Regenerate Link (invalidates the old one)</Text>
                </Pressable>
                <Pressable onPress={() => router.back()} className="mt-4 h-11 px-6 rounded-2xl border border-border items-center justify-center">
                  <Text className="text-foreground text-xs font-bold">Done</Text>
                </Pressable>
              </CRMCard>
            </ResponsiveSection>
          ) : (
            <>
              {error ? <ResponsiveSection><Text className="text-red-500 text-xs">{error}</Text></ResponsiveSection> : null}

              <ResponsiveSection>
                <CRMCard className="p-4">
                  <Field label="Workspace Name *" value={name} onChangeText={setName} placeholder="e.g. Talegaon Drive — Aug" />
                  <Field label="Employee Name *" value={employeeName} onChangeText={setEmployeeName} placeholder="e.g. Rahul Sharma" />
                  <Field label="Employee Phone" value={employeePhone} onChangeText={setEmployeePhone} placeholder="+91 XXXXX XXXXX" keyboardType="phone-pad" />

                  {campaigns.length ? (
                    <>
                      <Text className="text-foreground text-xs font-semibold mb-1.5">Campaign (optional)</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                        <View className="flex-row gap-2">
                          <Pressable onPress={() => setCampaignId(null)} className={`px-3 py-2 rounded-full border ${!campaignId ? "bg-primary border-primary" : "border-border"}`}>
                            <Text className={`text-xs font-semibold ${!campaignId ? "text-white" : "text-foreground"}`}>None</Text>
                          </Pressable>
                          {campaigns.map((campaign) => (
                            <Pressable key={campaign.id} onPress={() => setCampaignId(campaign.id)} className={`px-3 py-2 rounded-full border ${campaignId === campaign.id ? "bg-primary border-primary" : "border-border"}`}>
                              <Text className={`text-xs font-semibold ${campaignId === campaign.id ? "text-white" : "text-foreground"}`}>{campaign.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    </>
                  ) : null}

                  <Text className="text-foreground text-xs font-semibold mb-1.5">Expiry</Text>
                  <View className="flex-row gap-2 mb-2 flex-wrap">
                    {expiryPresets.map((preset) => (
                      <Pressable
                        key={preset.label}
                        onPress={() => { setExpiryHours(preset.hours); setCustomExpiry(""); }}
                        className={`px-3 py-2 rounded-full border ${expiryHours === preset.hours && !customExpiry ? "bg-primary border-primary" : "border-border"}`}
                      >
                        <Text className={`text-xs font-semibold ${expiryHours === preset.hours && !customExpiry ? "text-white" : "text-foreground"}`}>{preset.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={customExpiry}
                    onChangeText={setCustomExpiry}
                    placeholder="Custom date — YYYY-MM-DD"
                    placeholderTextColor="#9CA3AF"
                    className="h-11 border border-border rounded-2xl px-4 text-foreground bg-background"
                  />
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <CRMCard className="p-4">
                  <Pressable onPress={() => setShowAdvanced((current) => !current)} className="flex-row items-center justify-between">
                    <Text className="text-foreground text-sm font-bold">Permissions</Text>
                    <Text className="text-primary text-xs font-semibold">{showAdvanced ? "Hide advanced" : "Show advanced"}</Text>
                  </Pressable>
                  <Text className="text-muted-foreground text-metadata mt-1">Add vendors, notes, follow-ups, photos, calls and WhatsApp are on by default.</Text>
                  {showAdvanced ? (
                    <View className="mt-3 pt-3 border-t border-border">
                      {advancedPermissions.map((item) => (
                        <View key={item.key} className="flex-row items-center justify-between py-2">
                          <Text className="text-foreground text-xs font-semibold">{item.label}</Text>
                          <Switch
                            value={permissions[item.key]}
                            onValueChange={(value) => setPermissions((current) => ({ ...current, [item.key]: value }))}
                            trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }}
                            thumbColor={permissions[item.key] ? "#E91E63" : "#FFFFFF"}
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <Pressable
                  disabled={saving}
                  onPress={() => void generate()}
                  className="h-12 rounded-2xl bg-primary items-center justify-center"
                  style={{ opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Generate Workspace</Text>}
                </Pressable>
              </ResponsiveSection>
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
