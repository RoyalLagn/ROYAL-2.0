import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { Field, kitStyles } from "@/components/vendor/VendorProfileFormKit";
import { typeScale } from "@/constants/typography";
import { sanitizePhoneInput } from "@/utils/authValidation";

export type MarketingCardFormValues = {
  mobileNumber: string;
  whatsappNumber: string;
  email: string;
  instagram: string;
  website: string;
  tagline: string;
  experienceYears: string;
  happyClients: string;
};

export type MarketingCardFormErrors = Partial<Record<keyof MarketingCardFormValues, string>>;

// Every field is optional. Existing profile data is prefilled by the page;
// empty values simply disappear from the shared preview/export renderer.
export default function MarketingCardForm({
  colors,
  values,
  errors,
  onChange,
}: {
  colors: typeof vendorTheme.light;
  values: MarketingCardFormValues;
  errors: MarketingCardFormErrors;
  onChange: <K extends keyof MarketingCardFormValues>(key: K, value: MarketingCardFormValues[K]) => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>Contact Information</Text>
      <Field
        label="Mobile Number"
        value={values.mobileNumber}
        onChangeText={(value) => onChange("mobileNumber", sanitizePhoneInput(value))}
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        maxLength={20}
        colors={colors}
        error={errors.mobileNumber}
      />
      <Field
        label="WhatsApp Number"
        value={values.whatsappNumber}
        onChangeText={(value) => onChange("whatsappNumber", sanitizePhoneInput(value))}
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        maxLength={20}
        colors={colors}
        error={errors.whatsappNumber}
      />
      <Field
        label="Email Address"
        value={values.email}
        onChangeText={(value) => onChange("email", value)}
        placeholder="you@business.com"
        keyboardType="email-address"
        autoCapitalize="none"
        colors={colors}
        error={errors.email}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 6 }]}>Social Media</Text>
      <Field
        label="Instagram Username"
        value={values.instagram}
        onChangeText={(value) => onChange("instagram", value.replace(/^@/, ""))}
        placeholder="yourbusiness"
        autoCapitalize="none"
        colors={colors}
        error={errors.instagram}
      />
      <Field
        label="Website URL"
        value={values.website}
        onChangeText={(value) => onChange("website", value)}
        placeholder="https://yourbusiness.com"
        autoCapitalize="none"
        keyboardType="url"
        colors={colors}
        error={errors.website}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 6 }]}>Business Information</Text>
      <Field
        label="Business Tagline"
        value={values.tagline}
        onChangeText={(value) => onChange("tagline", value)}
        placeholder="Capturing Moments, Creating Memories"
        colors={colors}
        maxLength={120}
        error={errors.tagline}
      />
      <View style={styles.twoUp}>
        <View style={kitStyles.flex}>
          <Field
            label="Years of Experience"
            value={values.experienceYears}
            onChangeText={(value) => onChange("experienceYears", value.replace(/[^0-9]/g, ""))}
            placeholder="8"
            keyboardType="number-pad"
            colors={colors}
            error={errors.experienceYears}
          />
        </View>
        <View style={kitStyles.flex}>
          <Field
            label="Happy Clients"
            value={values.happyClients}
            onChangeText={(value) => onChange("happyClients", value)}
            placeholder="250+"
            colors={colors}
            maxLength={20}
            error={errors.happyClients}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionLabel: { fontSize: typeScale.metadata, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, marginTop: 2 },
  twoUp: { flexDirection: "row", gap: 12 },
});
