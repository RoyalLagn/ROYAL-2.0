import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Globe2, Mail } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace, VendorReadinessRules } from "@/hooks/useVendorWorkspace";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { Field, kitStyles, ReadinessBadge, SaveBar, SectionTitle, VendorWorkspaceGate } from "@/components/vendor/VendorProfileFormKit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Contact information: phone, email, website and social links -- every way
// a customer can reach or find this business. Business identity, about,
// location, brand and tags are all managed elsewhere.
export default function VendorEditContact() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, refresh } = useVendorWorkspace();
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    setContactPhone(data.vendor.contact_phone ?? "");
    setContactEmail(data.vendor.contact_email ?? "");
    setWebsite(data.vendor.website ?? "");
    setInstagram(data.vendor.instagram ?? "");
    setFacebook(data.vendor.facebook ?? "");
  }, [data.vendor]);

  const clearFeedback = () => { setSaved(false); setSaveError(""); };

  const save = async () => {
    if (saving || !data.vendor?.id) return;
    const trimmedEmail = contactEmail.trim();
    const trimmedPhone = contactPhone.trim();
    if (!trimmedPhone && !trimmedEmail) {
      setSaveError("Add at least one way for customers to reach you.");
      return Alert.alert("Contact method required", "Add a phone number or an email so customers can reach your business.");
    }
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setSaveError("Enter a valid email address.");
      return Alert.alert("Invalid email", "Enter a valid contact email address.");
    }
    setSaving(true);
    setSaveError("");
    try {
      await updateVendorPublicProfile({
        contact_phone: trimmedPhone || null,
        contact_email: trimmedEmail ? trimmedEmail.toLowerCase() : null,
        website: website.trim() || null,
        instagram: instagram.trim() || null,
        facebook: facebook.trim() || null,
      });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (!mounted.current) return;
      setSaved(true);
      setTimeout(() => { if (mounted.current) setSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to update contact information.";
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
            <Text style={[kitStyles.eyebrow, { color: colors.pink }]}>SECTION · CONTACT INFORMATION</Text>
            {data.vendor ? <ReadinessBadge colors={colors} state={VendorReadinessRules.contact(data.vendor)} /> : null}
          </View>
          <Text style={[kitStyles.title, { color: colors.text }]}>Contact information</Text>
          <Text style={[kitStyles.subtitle, { color: colors.muted }]}>
            How customers reach you: phone, email, website and social links. This does not affect any other section of your profile.
          </Text>
        </View>

        <VendorWorkspaceGate colors={colors} loading={loading} vendor={data.vendor} error={error} onRetry={() => void refresh()}>
          <View style={[kitStyles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionTitle icon={Mail} title="Customer contact" detail="Add at least one reliable way for customers to reach your business." colors={colors} />
            <View style={kitStyles.grid}>
              <View style={{ width: "48.8%" }}>
                <Field label="Contact phone / WhatsApp" value={contactPhone} onChangeText={(value) => { clearFeedback(); setContactPhone(value); }} placeholder="+91 98765 43210" colors={colors} keyboardType="phone-pad" />
              </View>
              <View style={{ width: "48.8%" }}>
                <Field label="Contact email" value={contactEmail} onChangeText={(value) => { clearFeedback(); setContactEmail(value); }} placeholder="hello@business.com" colors={colors} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>
          </View>

          <View style={[kitStyles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionTitle icon={Globe2} title="Online presence" detail="Optional links displayed together on your public profile." colors={colors} />
            <View style={kitStyles.grid}>
              <View style={{ width: "48.8%" }}>
                <Field label="Website" value={website} onChangeText={(value) => { clearFeedback(); setWebsite(value); }} placeholder="yourbusiness.com" colors={colors} keyboardType="url" autoCapitalize="none" />
              </View>
              <View style={{ width: "48.8%" }}>
                <Field label="Instagram" value={instagram} onChangeText={(value) => { clearFeedback(); setInstagram(value); }} placeholder="instagram.com/yourbusiness" colors={colors} keyboardType="url" autoCapitalize="none" />
              </View>
              <View style={{ width: "48.8%" }}>
                <Field label="Facebook" value={facebook} onChangeText={(value) => { clearFeedback(); setFacebook(value); }} placeholder="facebook.com/yourbusiness" colors={colors} keyboardType="url" autoCapitalize="none" />
              </View>
            </View>
          </View>

          <SaveBar
            colors={colors}
            saving={saving}
            saved={saved}
            saveError={saveError}
            savedLabel="Contact information updated"
            onPress={() => void save()}
          />
        </VendorWorkspaceGate>
      </ScrollView>
    </View>
  );
}
