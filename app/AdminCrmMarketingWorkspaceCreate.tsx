import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { DateField } from "@/components/admin/crm/ui/DateField";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";

function Field({ label, value, onChangeText, placeholder, multiline }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="text-foreground text-xs font-semibold mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        className={`border border-border rounded-2xl px-4 text-foreground bg-background ${multiline ? "min-h-24 py-3" : "h-12"}`}
      />
    </View>
  );
}

export default function AdminCrmMarketingWorkspaceCreate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If Start Date moves past the currently selected End Date, the range is
  // no longer valid — clear End Date rather than silently keeping an
  // impossible range, and tell the admin to pick it again.
  const handleStartDateChange = (nextStartDate: string) => {
    setStartDate(nextStartDate);
    if (endDate && nextStartDate && endDate < nextStartDate) {
      setEndDate("");
      Alert.alert("End date cleared", "The end date was before the new start date, so it was cleared. Please select a new end date.");
    }
  };

  const create = async () => {
    if (!name.trim() || !teamName.trim()) {
      setError("Enter a workspace name and team name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const workspace = await CrmMarketingWorkspaceService.create({
        name: name.trim(),
        teamName: teamName.trim(),
        description: description.trim() || null,
        startDate: startDate.trim() || null,
        endDate: endDate.trim() || null,
        priority: "medium",
        status: "active",
      });
      router.replace({ pathname: "/AdminCrmMarketingWorkspaceAssign", params: { workspaceId: workspace.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create workspace.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrmMarketingWorkspaces"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Create Marketing Workspace</Text>
        </View>
      </ResponsiveContainer>

      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          {error ? <ResponsiveSection><Text className="text-red-500 text-xs">{error}</Text></ResponsiveSection> : null}

          <ResponsiveSection>
            <CRMCard className="p-4">
              <Field label="Workspace Name *" value={name} onChangeText={setName} placeholder="e.g. Pune Banquet Hall Campaign" />
              <Field label="Assign Team *" value={teamName} onChangeText={setTeamName} placeholder="e.g. Team Alpha" />
              <Field label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Target Banquet Halls in Pune" multiline />
              <DateField label="Start Date" value={startDate} onChange={handleStartDateChange} />
              <DateField label="End Date" value={endDate} onChange={setEndDate} minimumDate={startDate || undefined} />
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <Pressable
              disabled={saving}
              onPress={() => void create()}
              className="h-12 rounded-2xl bg-primary items-center justify-center"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">Next: Assign Categories &amp; Vendors</Text>}
            </Pressable>
          </ResponsiveSection>
        </ResponsiveContainer>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
