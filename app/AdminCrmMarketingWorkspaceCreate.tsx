import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import type { MarketingWorkspacePriority, MarketingWorkspaceStatus } from "@/types/crm/marketingWorkspace";

const priorities: MarketingWorkspacePriority[] = ["low", "medium", "high"];
const statuses: MarketingWorkspaceStatus[] = ["active", "paused", "completed"];

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
  const [priority, setPriority] = useState<MarketingWorkspacePriority>("medium");
  const [status, setStatus] = useState<MarketingWorkspaceStatus>("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        priority,
        status,
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          {error ? <ResponsiveSection><Text className="text-red-500 text-xs">{error}</Text></ResponsiveSection> : null}

          <ResponsiveSection>
            <CRMCard className="p-4">
              <Field label="Workspace Name *" value={name} onChangeText={setName} placeholder="e.g. Pune Banquet Hall Campaign" />
              <Field label="Assign Team *" value={teamName} onChangeText={setTeamName} placeholder="e.g. Team Alpha" />
              <Field label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Target Banquet Halls in Pune" multiline />
              <Field label="Start Date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
              <Field label="End Date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />

              <Text className="text-foreground text-xs font-semibold mb-1.5">Priority</Text>
              <View className="flex-row gap-2 mb-3">
                {priorities.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setPriority(item)}
                    className={`px-3 py-2 rounded-full border capitalize ${priority === item ? "bg-primary border-primary" : "border-border"}`}
                  >
                    <Text className={`text-xs font-semibold capitalize ${priority === item ? "text-white" : "text-foreground"}`}>{item}</Text>
                  </Pressable>
                ))}
              </View>

              <Text className="text-foreground text-xs font-semibold mb-1.5">Status</Text>
              <View className="flex-row gap-2">
                {statuses.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setStatus(item)}
                    className={`px-3 py-2 rounded-full border capitalize ${status === item ? "bg-primary border-primary" : "border-border"}`}
                  >
                    <Text className={`text-xs font-semibold capitalize ${status === item ? "text-white" : "text-foreground"}`}>{item}</Text>
                  </Pressable>
                ))}
              </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}
