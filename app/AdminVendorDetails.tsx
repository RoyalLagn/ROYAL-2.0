import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Pressable,
  ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Edit3, ExternalLink, MessageCircle, MoreVertical, Phone, QrCode, RefreshCw, X } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveColumns } from "@/components/responsive/ResponsiveColumns";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { DashboardWidget } from "@/components/admin/dashboard/DashboardWidget";
import { AdminVendorService } from "@/services/adminVendorService";
import type { AdminVendorRecord, VendorDetails } from "@/types/adminVendors";
import { KPIChip } from "@/components/admin/ui/KPIChip";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
import { buildVendorPublicProfileUrl, regenerateVendorSlug, setVendorPublicProfileEnabled } from "@/services/vendorPublicProfile";
import PageLoader from "@/components/loading/PageLoader";

const PHONE_UNAVAILABLE_MESSAGE = "Phone number not available.";

export default function AdminVendorDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const [details, setDetails] = useState<VendorDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setError("Vendor ID is missing."); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const record = await AdminVendorService.getRecord(id);
      setDetails(await AdminVendorService.details(record));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load vendor.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error || !details) return <SafeAreaView className="flex-1 bg-background items-center justify-center px-6"><Text className="text-red-500 text-center">{error || "Vendor not found."}</Text><Pressable className="min-h-11 mt-4 justify-center" onPress={() => void load()}><Text className="text-primary font-semibold">Try again</Text></Pressable></SafeAreaView>;

  const { record, vendor, application } = details;
  const average = details.reviews.length
    ? details.reviews.reduce((sum, review) => sum + Number(review.rating), 0) / details.reviews.length
    : 0;
  const missing = [
    !record.logo_url && "Logo", !vendor?.description && "Description",
    !record.email && "Email", !record.phone && "Phone",
    !details.services.length && "Services", !details.media.length && "Gallery",
  ].filter(Boolean) as string[];
  const completeness = Math.round(((6 - missing.length) / 6) * 100);
  const healthScore = Math.min(100, Math.round(completeness * 0.55 + (record.is_verified ? 15 : 0) + Math.min(details.services.length, 5) * 3 + Math.min(details.media.length, 5) * 3 + Math.min(details.reviews.length, 10)));
  const timeline = buildTimeline(details);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={() => router.canGoBack() ? router.back() : router.replace("/vendors-admin-listing")}><ArrowLeft size={21} className="text-foreground" /></Pressable>
        <View className="flex-1 px-2"><Text className="text-foreground text-xl font-bold" numberOfLines={1}>{record.business_name}</Text><Text className="text-muted-foreground text-xs">Vendor ID: {record.vendor_id || record.record_id}</Text></View>
        {record.vendor_id ? <Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={() => setEditOpen(true)}><Edit3 size={19} className="text-primary" /></Pressable> : <MoreVertical size={20} className="text-muted-foreground" />}
      </ResponsiveContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <ResponsiveContainer>
          <ResponsiveSection>
            <View className="bg-card border border-border rounded-3xl p-5">
              <View className="flex-row items-center">
                {record.logo_url ? <Image source={{ uri: record.logo_url }} className="w-20 h-20 rounded-3xl bg-white" resizeMode="contain" /> : <View className="w-20 h-20 rounded-3xl bg-primary/10 items-center justify-center"><Text className="text-primary text-xl font-bold">{record.business_name.slice(0, 2).toUpperCase()}</Text></View>}
                <View className="flex-1 min-w-0 ml-4"><Text className="text-foreground text-xl font-bold" numberOfLines={2}>{record.business_name}</Text><Text className="text-muted-foreground mt-1">{record.owner_name}</Text><Text className="text-primary text-xs font-semibold capitalize mt-2">{record.application_status} · {record.management_status} · {record.is_verified ? "Verified" : "Unverified"}</Text></View>
              </View>
              <View className="flex-row flex-wrap gap-3 mt-5">
                <Metric label="Reviews" value={details.reviews.length.toString()} />
                <Metric label="Average Rating" value={average.toFixed(2)} />
                <Metric label="Services" value={details.services.length.toString()} />
                <Metric label="Portfolio" value={details.media.length.toString()} />
                <Metric label="Health Score" value={`${healthScore}%`} />
                <Metric label="Profile Complete" value={`${completeness}%`} />
              </View>
              <View className="flex-row flex-wrap gap-2 mt-4">
                <KPIChip label="Gallery" value={details.media.length} />
                <KPIChip label="Services" value={details.services.length} />
                <KPIChip label="Reviews" value={details.reviews.length} />
                <KPIChip label="Rating" value={average.toFixed(1)} />
                <KPIChip label={record.plan_name} tone="primary" />
                <KPIChip label={record.is_verified ? "Verified" : "Unverified"} tone={record.is_verified ? "success" : "warning"} />
              </View>
              <View className="mt-4">
                <View className="h-2 bg-muted rounded-full overflow-hidden"><View className={`h-full rounded-full ${completeness >= 80 ? "bg-emerald-500" : completeness >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${completeness}%` }} /></View>
                {missing.length ? <Text className="text-amber-500 text-xs mt-2">Missing: {missing.join(", ")}</Text> : <Text className="text-emerald-500 text-xs mt-2">Profile is complete</Text>}
              </View>
              <View className="flex-row flex-wrap gap-3 mt-4">
                {vendor?.website ? <LinkButton label="Website" url={vendor.website} /> : null}
                <CallButton phone={record.phone} />
                <WhatsAppButton phone={record.phone} />
                {record.vendor_id ? (
                  <Pressable
                    className="min-h-11 px-4 rounded-full bg-primary items-center justify-center flex-row"
                    onPress={() =>
                      vendor?.slug
                        ? router.push({ pathname: "/vendors/[slug]", params: { slug: vendor.slug, src: "admin_preview" } })
                        : router.push({ pathname: "/VendorsProfile", params: { vendorId: record.vendor_id, src: "admin_preview" } })
                    }
                  >
                    <ExternalLink size={14} color="#FFFFFF" />
                    <Text className="text-white text-xs font-semibold ml-2">View Public Profile</Text>
                  </Pressable>
                ) : null}
              </View>
              {record.vendor_id ? (
                <PublicProfileAdminControls vendorId={record.vendor_id} vendor={vendor} onChanged={() => void load()} />
              ) : null}
            </View>
          </ResponsiveSection>

          <ResponsiveColumns>
            <DashboardWidget title="Business Information">
              <InfoRows rows={[
                ["Description", vendor?.description || application?.description],
                ["Category", record.category_name],
                ["Location", [vendor?.address || application?.address, record.city, record.state, vendor?.pincode || application?.pincode].filter(Boolean).join(", ")],
                ["Experience", vendor?.experience != null ? `${vendor.experience} years` : application?.experience != null ? `${application.experience} years` : null],
                ["Registered", new Date(record.registered_at).toLocaleString()],
                ["Last Updated", new Date(record.updated_at).toLocaleString()],
              ]} />
            </DashboardWidget>
            <DashboardWidget title="Owner & Contact">
              <InfoRows rows={[
                ["Owner", record.owner_name], ["Email", record.email], ["Phone", record.phone],
                ["Website", vendor?.website || application?.website],
                ["Instagram", vendor?.instagram || application?.instagram],
                ["Facebook", vendor?.facebook || application?.facebook],
              ]} />
            </DashboardWidget>
            <DashboardWidget title="Subscription & Approval">
              <InfoRows rows={[
                ["Plan", record.plan_name], ["Subscription", record.subscription_status],
                ["Application", record.application_status], ["Verification", record.is_verified ? "Verified" : "Unverified"],
                ["Vendor Status", record.management_status],
                ["Rejection Reason", application?.rejection_reason],
              ]} />
            </DashboardWidget>
            <DashboardWidget title="Availability">
              {details.availability.length ? details.availability.slice(0, 8).map((slot) => <InfoRows key={slot.id} rows={[[new Date(`${slot.date}T00:00:00`).toLocaleDateString(), slot.status]]} />) : <Empty text="No exceptions. Future dates are available by default." />}
            </DashboardWidget>
          </ResponsiveColumns>

          <ResponsiveSection style={{ marginTop: 20 }}>
            <DashboardWidget title="Services & Pricing">
              {details.services.length ? details.services.map((service) => <View key={service.id} className="py-3 border-b border-border flex-row justify-between gap-3"><View className="flex-1"><Text className="text-foreground font-semibold">{service.title}</Text><Text className="text-muted-foreground text-xs mt-1">{service.description || "No description"}</Text></View><Text className="text-primary font-bold">{service.price != null ? `₹${Number(service.price).toLocaleString()}` : "Contact"}</Text></View>) : <Empty text="No services configured." />}
            </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
            <DashboardWidget title="Gallery & Portfolio">
              {details.media.length ? <View className="flex-row flex-wrap gap-2">{details.media.slice(0, 12).map((media) => <Image key={media.id} source={{ uri: media.thumbnail_url || media.secure_url }} className="w-24 h-24 rounded-2xl bg-muted" />)}</View> : <Empty text="No portfolio media uploaded." />}
            </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
            <DashboardWidget title="Application History">
              {details.applications.length ? details.applications.map((entry) => (
                <View key={entry.id} className="py-3 border-b border-border flex-row justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-semibold" numberOfLines={1}>{entry.business_name}</Text>
                    <Text className="text-muted-foreground text-xs">{new Date(entry.submitted_at).toLocaleString()}</Text>
                    {entry.rejection_reason ? <Text className="text-red-500 text-xs mt-1">{entry.rejection_reason}</Text> : null}
                  </View>
                  <Text className="text-primary text-xs font-semibold capitalize">{entry.status}</Text>
                </View>
              )) : <Empty text="No application history available." />}
            </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
            <DashboardWidget title="Vendor Timeline">
              {timeline.length ? timeline.map((event, index) => <View key={`${event.title}-${event.at}-${index}`} className="flex-row pb-4"><View className="items-center mr-3"><View className="w-3 h-3 rounded-full bg-primary mt-1" />{index < timeline.length - 1 ? <View className="w-px flex-1 bg-border mt-1" /> : null}</View><View className="flex-1"><Text className="text-foreground font-semibold">{event.title}</Text><Text className="text-muted-foreground text-xs">{new Date(event.at).toLocaleString()}</Text>{event.actor ? <Text className="text-muted-foreground text-xs">By {event.actor}</Text> : null}</View></View>) : <Empty text="No timeline events available." />}
            </DashboardWidget>
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      {vendor ? <EditVendorModal visible={editOpen} record={record} vendor={vendor} onClose={() => setEditOpen(false)} onSaved={async () => { setEditOpen(false); await load(); }} /> : null}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <View className="bg-muted/60 rounded-2xl p-3 min-w-24"><Text className="text-foreground font-bold text-lg">{value}</Text><Text className="text-muted-foreground text-xs">{label}</Text></View>; }
function InfoRows({ rows }: { rows: [string, any][] }) { return <View>{rows.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => <View key={label} className="py-3 border-b border-border"><Text className="text-muted-foreground text-metadata uppercase tracking-wider">{label}</Text><Text className="text-foreground text-sm mt-1">{String(value)}</Text></View>)}</View>; }
function Empty({ text }: { text: string }) { return <Text className="text-muted-foreground text-sm text-center py-5">{text}</Text>; }
function LinkButton({ label, url }: { label: string; url: string }) { return <Pressable className="min-h-11 px-4 rounded-full border border-border flex-row items-center justify-center" onPress={() => void Linking.openURL(url)}><ExternalLink size={14} className="text-primary mr-2" /><Text className="text-primary text-xs font-semibold">{label}</Text></Pressable>; }

function CallButton({ phone }: { phone: string | null }) {
  const hasPhone = Boolean(phone);
  return (
    <Pressable
      accessibilityLabel="Call vendor"
      accessibilityState={{ disabled: !hasPhone }}
      className="min-h-11 px-4 rounded-full items-center justify-center flex-row"
      style={{ backgroundColor: "#16A34A", opacity: hasPhone ? 1 : 0.5 }}
      onPress={() => (hasPhone ? void Linking.openURL(`tel:${phone}`) : Alert.alert(PHONE_UNAVAILABLE_MESSAGE))}
    >
      <Phone size={14} color="#FFFFFF" />
      <Text className="text-white text-xs font-semibold ml-2">Call Vendor</Text>
    </Pressable>
  );
}

function WhatsAppButton({ phone }: { phone: string | null }) {
  const hasPhone = Boolean(phone);
  return (
    <Pressable
      accessibilityLabel="Message vendor on WhatsApp"
      accessibilityState={{ disabled: !hasPhone }}
      className="min-h-11 px-4 rounded-full items-center justify-center flex-row"
      style={{ backgroundColor: "#25D366", opacity: hasPhone ? 1 : 0.5 }}
      onPress={() => (hasPhone ? void Linking.openURL(`https://wa.me/${normalizeWhatsAppPhone(phone)}`) : Alert.alert(PHONE_UNAVAILABLE_MESSAGE))}
    >
      <MessageCircle size={14} color="#FFFFFF" />
      <Text className="text-white text-xs font-semibold ml-2">WhatsApp</Text>
    </Pressable>
  );
}

function PublicProfileAdminControls({ vendorId, vendor, onChanged }: { vendorId: string; vendor: Record<string, any> | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<"regenerate" | "toggle" | null>(null);
  const slug = vendor?.slug as string | undefined;
  const enabled = vendor?.public_profile_enabled !== false;

  const handleRegenerate = () => {
    if (!slug) return;
    Alert.alert(
      "Regenerate slug?",
      "The current public profile link will redirect to the new one, but any QR codes printed with the old link will need to be reprinted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setBusy("regenerate");
            try {
              await regenerateVendorSlug(vendorId);
              onChanged();
            } catch (error) {
              Alert.alert("Could not regenerate slug", error instanceof Error ? error.message : "Please try again.");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const updatePublicProfile = async () => {
    setBusy("toggle");
    try {
      await setVendorPublicProfileEnabled(vendorId, !enabled);
      onChanged();
    } catch (error) {
      Alert.alert("Could not update public profile", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = () => {
    Alert.alert(
      `${enabled ? "Disable" : "Enable"} public profile?`,
      enabled
        ? "Customers will no longer be able to open this vendor's public profile until you enable it again."
        : "Customers will be able to view and contact this vendor from their public profile.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: enabled ? "destructive" : "default",
          onPress: () => void updatePublicProfile(),
        },
      ],
    );
  };

  if (!slug) {
    return <Text className="text-muted-foreground text-xs mt-3">No public profile slug yet — assigned automatically on approval.</Text>;
  }

  return (
    <View className="mt-4 pt-4 border-t border-border">
      <Text className="text-muted-foreground text-metadata uppercase tracking-wider mb-2">Public Profile</Text>
      <Text className="text-foreground text-xs mb-3" numberOfLines={1}>{buildVendorPublicProfileUrl(slug)}</Text>
      <View className="flex-row flex-wrap gap-3">
        <Pressable
          disabled={busy !== null}
          className="min-h-11 px-4 rounded-full border border-border items-center justify-center flex-row"
          style={{ opacity: busy ? 0.6 : 1 }}
          onPress={handleRegenerate}
        >
          <RefreshCw size={14} className="text-primary mr-2" />
          <Text className="text-primary text-xs font-semibold">{busy === "regenerate" ? "Regenerating…" : "Regenerate Slug"}</Text>
        </Pressable>
        <Pressable
          disabled={busy !== null}
          className="min-h-11 px-4 rounded-full items-center justify-center flex-row"
          style={{ backgroundColor: enabled ? "#DC2626" : "#16A34A", opacity: busy ? 0.6 : 1 }}
          onPress={handleToggle}
        >
          <QrCode size={14} color="#FFFFFF" />
          <Text className="text-white text-xs font-semibold ml-2">
            {busy === "toggle" ? "Updating…" : enabled ? "Disable Public Profile" : "Enable Public Profile"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildTimeline(details: VendorDetails) {
  const result: { title: string; at: string; actor?: string }[] = [];
  if (details.record.registered_at) result.push({ title: "Vendor Registered", at: details.record.registered_at });
  for (const application of details.applications) {
    if (application.submitted_at) result.push({ title: "Application Submitted", at: application.submitted_at });
    if (application.reviewed_at) result.push({ title: `Application ${application.status}`, at: application.reviewed_at });
  }
  if (details.vendor?.updated_at && details.vendor.updated_at !== details.vendor.created_at) result.push({ title: "Profile Updated", at: details.vendor.updated_at });
  if (details.services[0]?.updated_at) result.push({ title: "Services Updated", at: details.services[0].updated_at });
  if (details.media[0]?.updated_at) result.push({ title: "Gallery Updated", at: details.media[0].updated_at });
  if (details.subscriptions[0]?.created_at) result.push({ title: "Subscription Updated", at: details.subscriptions[0].created_at });
  for (const event of details.activity) result.push({ title: String(event.action).replaceAll("_", " "), at: event.created_at, actor: event.profiles?.full_name || event.profiles?.email });
  return result.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function EditVendorModal({ visible, record, vendor, onClose, onSaved }: { visible: boolean; record: AdminVendorRecord; vendor: Record<string, any>; onClose: () => void; onSaved: () => Promise<void> }) {
  const fields = ["business_name", "owner_name", "contact_email", "contact_phone", "description", "address", "city", "state", "website", "instagram", "facebook"];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field, String(vendor[field] ?? "")])));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!record.vendor_id) return;
    if (!values.business_name.trim()) return Alert.alert("Business name required", "Enter the vendor business name.");
    if (values.contact_email && !/^\S+@\S+\.\S+$/.test(values.contact_email.trim())) return Alert.alert("Invalid email", "Enter a valid contact email.");
    for (const field of ["website", "instagram", "facebook"]) {
      if (values[field] && !/^https?:\/\//i.test(values[field].trim())) return Alert.alert("Invalid link", `${field.replaceAll("_", " ")} must begin with http:// or https://.`);
    }
    setSaving(true);
    try { await AdminVendorService.update(record.vendor_id, values); await onSaved(); }
    catch (error) { Alert.alert("Update failed", error instanceof Error ? error.message : "Unable to update vendor."); }
    finally { setSaving(false); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View className="flex-1 bg-black/60 justify-end"><View className="bg-card rounded-t-3xl p-5 max-h-[90%]"><View className="flex-row justify-between items-center"><Text className="text-foreground text-xl font-bold">Edit Vendor</Text><Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={onClose}><X size={21} className="text-foreground" /></Pressable></View><ScrollView>{fields.map((field) => <View key={field} className="mt-3"><Text className="text-muted-foreground text-xs capitalize mb-1">{field.replaceAll("_", " ")}</Text><TextInput className={`bg-background border border-border rounded-xl px-4 text-foreground ${field === "description" ? "min-h-24 py-3" : "h-12"}`} multiline={field === "description"} value={values[field]} onChangeText={(value) => setValues((current) => ({ ...current, [field]: value }))} /></View>)}<Pressable className="bg-primary min-h-12 rounded-2xl items-center justify-center mt-5" onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color="#FFF" /> : <Text className="text-white font-bold">Save Changes</Text>}</Pressable></ScrollView></View></View></Modal>;
}
