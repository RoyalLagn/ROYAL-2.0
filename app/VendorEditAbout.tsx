import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Award, Languages, NotebookPen } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import VendorSectionHeading, { useVendorSectionPageStyle } from "@/components/vendor/VendorSectionHeading";
import { VendorSectionChips, VendorSectionGroup, VendorSectionPanel, VendorSectionRule } from "@/components/vendor/VendorSectionPanel";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace, VendorReadinessRules } from "@/hooks/useVendorWorkspace";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { Field, kitStyles, ReadinessBadge, SaveBar, VendorWorkspaceGate } from "@/components/vendor/VendorProfileFormKit";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

const listToText = (values?: string[] | null) => (values ?? []).join(", ");
const textToList = (value: string, limit: number) =>
  value.split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, limit);

// About the business: description, years of experience, awards and
// languages spoken -- the customer-facing "who we are" content. Services,
// pricing, portfolio and availability each have their own dedicated
// section and are not touched here.
export default function VendorEditAbout() {
  const pageStyle = useVendorSectionPageStyle();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, refresh } = useVendorWorkspace();
  const [description, setDescription] = useState("");
  const [experience, setExperience] = useState("");
  const [awards, setAwards] = useState("");
  const [languages, setLanguages] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    setDescription(data.vendor.description ?? "");
    setExperience(data.vendor.experience != null ? String(data.vendor.experience) : "");
    setAwards(listToText(data.vendor.awards));
    setLanguages(listToText(data.vendor.languages));
  }, [data.vendor]);

  const awardList = useMemo(() => textToList(awards, 15), [awards]);
  const languageList = useMemo(() => textToList(languages, 15), [languages]);
  const hasUnsavedChanges = Boolean(data.vendor) && (
    description !== (data.vendor?.description ?? "")
    || experience !== (data.vendor?.experience != null ? String(data.vendor.experience) : "")
    || awards !== listToText(data.vendor?.awards)
    || languages !== listToText(data.vendor?.languages)
  );
  useUnsavedChangesGuard(hasUnsavedChanges);
  const clearFeedback = () => { setSaved(false); setSaveError(""); };

  const save = async () => {
    if (saving || !data.vendor?.id) return;
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setSaveError("Add a short introduction so customers know what to expect.");
      return Alert.alert("Description required", "Describe your experience, style and what customers can expect.");
    }
    let experienceValue: number | null = null;
    if (experience.trim()) {
      const parsed = Number(experience.trim());
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        setSaveError("Years of experience must be a whole number between 0 and 100.");
        return Alert.alert("Invalid experience", "Enter a valid number of years (0–100), or leave it blank.");
      }
      experienceValue = parsed;
    }
    setSaving(true);
    setSaveError("");
    try {
      await updateVendorPublicProfile({
        description: trimmedDescription,
        experience: experienceValue,
        awards: awardList,
        languages: languageList,
      });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (!mounted.current) return;
      setSaved(true);
      setTimeout(() => { if (mounted.current) setSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to update about-the-business details.";
      setSaveError(message);
      Alert.alert("Not saved", message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <View style={[kitStyles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <KeyboardAwareScrollView
        avoidKeyboardOnAndroid
        contentContainerStyle={pageStyle}
      >
        <VendorSectionHeading
          title="About the business"
          subtitle="The story couples read before they enquire. Services, photos and availability stay in their own sections."
          badge={data.vendor ? <ReadinessBadge colors={colors} state={VendorReadinessRules.about(data.vendor)} /> : null}
        />

        <VendorWorkspaceGate colors={colors} loading={loading} vendor={data.vendor} error={error} onRetry={() => void refresh()}>
          <VendorSectionPanel backgroundColor="#FFF8E8" borderColor="rgba(239, 121, 91, 0.18)">
            <VendorSectionGroup icon={NotebookPen} iconColor="#EF795B" title="Introduction" detail="Describe your experience, style and what customers can expect.">
              <Field
                label="About the business"
                required
                value={description}
                onChangeText={(value) => { clearFeedback(); setDescription(value); }}
                placeholder="Describe your experience, style and what customers can expect."
                colors={colors}
                multiline
                advanceOnSubmit
                maxLength={1200}
                helper={`${description.length}/1200 · Aim for at least 80 useful characters.`}
              />
              <View style={styles.experience}>
                <Field
                  label="Years of experience"
                  value={experience}
                  onChangeText={(value) => { clearFeedback(); setExperience(value.replace(/[^0-9]/g, "")); }}
                  placeholder="e.g. 8"
                  colors={colors}
                  keyboardType="number-pad"
                  helper="Optional. Shown to customers as your years in business."
                />
              </View>
            </VendorSectionGroup>

            <VendorSectionRule color="rgba(239, 121, 91, 0.16)" />

            <VendorSectionGroup icon={Award} iconColor="#EF795B" title="Awards and recognition" detail="Optional highlights shown on your public profile.">
              <Field
                label="Awards"
                value={awards}
                onChangeText={(value) => { clearFeedback(); setAwards(value); }}
                placeholder="Best Wedding Photographer 2024, WeddingSutra Awards"
                colors={colors}
                helper="Separate with commas. Up to 15 will be saved."
              />
              <VendorSectionChips items={awardList} color="#9A4E38" />
            </VendorSectionGroup>

            <VendorSectionRule color="rgba(239, 121, 91, 0.16)" />

            <VendorSectionGroup icon={Languages} iconColor="#EF795B" title="Languages spoken" detail="Optional. Helps customers know if you can communicate in their language.">
              <Field
                label="Languages"
                value={languages}
                onChangeText={(value) => { clearFeedback(); setLanguages(value); }}
                placeholder="English, Hindi, Marathi"
                colors={colors}
                helper="Separate with commas. Up to 15 will be saved."
              />
              <VendorSectionChips items={languageList} color="#9A4E38" />
            </VendorSectionGroup>

            <SaveBar
              embedded
              colors={colors}
              saving={saving}
              saved={saved}
              saveError={saveError}
              savedLabel="About the business updated"
              onPress={() => void save()}
            />
          </VendorSectionPanel>
        </VendorWorkspaceGate>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  experience: {
    maxWidth: 220,
  },
});
