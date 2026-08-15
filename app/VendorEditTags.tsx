import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Search } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace, VendorReadinessRules } from "@/hooks/useVendorWorkspace";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { Field, kitStyles, ReadinessBadge, SaveBar, SectionTitle, VendorWorkspaceGate } from "@/components/vendor/VendorProfileFormKit";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

// Search tags: the keywords customers use to discover this business in
// search. Only the `tags` column is touched here.
export default function VendorEditTags() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, refresh } = useVendorWorkspace();
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    setTags((data.vendor.tags ?? []).join(", "));
  }, [data.vendor]);

  const tagList = useMemo(
    () => tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    [tags],
  );
  const hasUnsavedChanges = Boolean(data.vendor) && tags !== (data.vendor?.tags ?? []).join(", ");
  useUnsavedChangesGuard(hasUnsavedChanges);

  const save = async () => {
    if (saving || !data.vendor?.id) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateVendorPublicProfile({ tags: tagList });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (!mounted.current) return;
      setSaved(true);
      setTimeout(() => { if (mounted.current) setSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to update search tags.";
      setSaveError(message);
      Alert.alert("Not saved", message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <View style={[kitStyles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={kitStyles.content}>
        <View style={kitStyles.heading}>
          <View style={kitStyles.headingRow}>
            <Text style={[kitStyles.eyebrow, { color: colors.pink }]}>SECTION · SEARCH TAGS</Text>
            {data.vendor ? <ReadinessBadge colors={colors} state={VendorReadinessRules.tags(data.vendor)} /> : null}
          </View>
          <Text style={[kitStyles.title, { color: colors.text }]}>Search tags</Text>
          <Text style={[kitStyles.subtitle, { color: colors.muted }]}>
            Keywords customers may search for. This does not affect any other section of your profile.
          </Text>
        </View>

        <VendorWorkspaceGate colors={colors} loading={loading} vendor={data.vendor} error={error} onRetry={() => void refresh()}>
          <View style={[kitStyles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionTitle icon={Search} title="Search discovery" detail="Use a small set of relevant phrases customers may search for." colors={colors} />
            <Field
              label="Search tags"
              value={tags}
              onChangeText={(value) => { setSaved(false); setSaveError(""); setTags(value); }}
              placeholder="candid wedding, luxury decor, pune"
              colors={colors}
              helper="Separate tags with commas. Up to 12 tags will be saved."
            />
            {tagList.length ? (
              <View style={kitStyles.tags}>
                {tagList.map((tag) => <Text key={tag} style={[kitStyles.tag, { color: colors.pink, backgroundColor: colors.surfaceSoft }]}>{tag}</Text>)}
              </View>
            ) : null}
          </View>

          <SaveBar
            colors={colors}
            saving={saving}
            saved={saved}
            saveError={saveError}
            savedLabel="Search tags updated"
            onPress={() => void save()}
          />
        </VendorWorkspaceGate>
      </ScrollView>
    </View>
  );
}
