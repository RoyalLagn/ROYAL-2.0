import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View, } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera, Check, Mail, Phone, Save, UserRound } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  CloudinaryError, deleteManagedProfileImage, pickProfileImage, uploadProfileImage, type ProfileImageAsset, } from "@/services/cloudinary";
import { getPublicAuthError, updatePublicProfile } from "@/services/publicAuth";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import SquareImageEditor from "@/components/vendor/SquareImageEditor";

export default function EditProfile() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const { session, profile, loading, isPublicAuthenticated, refreshProfile } = usePublicAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [photoEditorAsset, setPhotoEditorAsset] = useState<ProfileImageAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const surface = dark ? "#211D20" : "#FFFFFF";
  const background = dark ? "#171417" : "#FFFFFF";
  const soft = dark ? "#2A2025" : "#FFF0F5";
  const border = dark ? "#3D3036" : "#F0DDE5";
  const text = dark ? "#FFF8FB" : "#191418";
  const muted = dark ? "#B9AEB4" : "#776A71";
  const pink = dark ? "#FF4F8B" : "#E91E63";

  useEffect(() => {
    if (!loading && !isPublicAuthenticated) router.replace("/DashboardCenter");
  }, [isPublicAuthenticated, loading, router]);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setProfileImage(profile?.profile_image ?? null);
  }, [profile]);

  const choosePhoto = async () => {
    if (uploading || !session?.user.id) return;
    setUploading(true);
    try {
      const asset = await pickProfileImage();
      if (asset) setPhotoEditorAsset(asset);
    } catch (error) {
      Alert.alert("Photo not selected", error instanceof CloudinaryError ? error.message : "Unable to open this photo.");
    } finally {
      setUploading(false);
    }
  };

  const saveEditedPhoto = async (asset: ProfileImageAsset) => {
    if (!session?.user.id) return;
    setUploading(true);
    const previousUrl = profileImage;
    try {
      const url = await uploadProfileImage({ kind: "customer" }, asset);
      try {
        await updatePublicProfile(session.user.id, { profileImage: url });
      } catch (error) {
        await deleteManagedProfileImage({ kind: "customer" }, url).catch(() => undefined);
        throw error;
      }
      setProfileImage(url);
      setPhotoEditorAsset(null);
      await refreshProfile();
      if (previousUrl && previousUrl !== url) {
        await deleteManagedProfileImage({ kind: "customer" }, previousUrl).catch(() => {
          Alert.alert("Photo updated", "Your new photo is saved, but the previous image could not be cleaned up yet.");
        });
      }
      setSaved(false);
    } catch (error) {
      Alert.alert("Photo not uploaded", error instanceof CloudinaryError ? error.message : "Unable to upload this photo.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (uploading || !session?.user.id || !profileImage) return;
    const previousUrl = profileImage;
    setUploading(true);
    try {
      await updatePublicProfile(session.user.id, { profileImage: null });
      setProfileImage(null);
      await refreshProfile();
      await deleteManagedProfileImage({ kind: "customer" }, previousUrl).catch(() => {
        Alert.alert("Photo removed", "Your profile was updated, but the previous image could not be cleaned up yet.");
      });
      setSaved(false);
    } catch (error) {
      Alert.alert("Photo not removed", getPublicAuthError(error, "Unable to remove your profile photo."));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!session?.user.id) return Alert.alert("Session expired", "Sign in again to update your profile.");
    setSaving(true);
    setSaved(false);
    try {
      await updatePublicProfile(session.user.id, {
        fullName,
        phone: phone || null,
        profileImage,
      });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (error) {
      Alert.alert("Profile not saved", getPublicAuthError(error, "Unable to update your profile."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return <View style={[styles.loading, { backgroundColor: background }]}><ActivityIndicator color={pink} /></View>;
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      <View style={[styles.header, { backgroundColor: surface, borderBottomColor: border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={4} onPress={() => router.back()} style={[styles.back, { backgroundColor: soft }]}>
          <ArrowLeft size={20} color={text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={[styles.headerTitle, { color: text }]}>Edit profile</Text>
          <Text style={[styles.headerHint, { color: muted }]}>Customer account</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 66 : 0}
      >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.content}
      >
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: pink }]}>PERSONAL INFORMATION</Text>
          <Text style={[styles.title, { color: text }]}>Your customer profile</Text>
          <Text style={[styles.subtitle, { color: muted }]}>These details are stored in your RoyalLagn account and appear consistently across your profile and Admin user records.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.photoRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              accessibilityState={{ disabled: uploading, busy: uploading }}
              disabled={uploading}
              onPress={choosePhoto}
              style={[styles.avatar, { backgroundColor: soft, borderColor: border }]}
            >
              {profileImage ? <Image source={{ uri: profileImage }} style={styles.avatarImage} /> : <UserRound size={36} color={pink} />}
              <View style={[styles.camera, { backgroundColor: pink, borderColor: surface }]}>
                {uploading ? <ActivityIndicator color="#FFF" size="small" /> : <Camera size={14} color="#FFF" />}
              </View>
            </Pressable>
            <View style={styles.flex}>
              <Text style={[styles.photoTitle, { color: text }]}>Profile photo</Text>
              <Text style={[styles.photoHint, { color: muted }]}>Use a clear square image. It will be saved with the rest of your profile.</Text>
              {profileImage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  accessibilityState={{ disabled: uploading, busy: uploading }}
                  hitSlop={10}
                  disabled={uploading}
                  onPress={removePhoto}
                >
                  <Text style={[styles.removePhoto, { color: pink }]}>Remove photo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: border }]} />
          <Field icon={UserRound} label="Full name" value={fullName} onChangeText={(value) => { setFullName(value); setSaved(false); }} placeholder="Your full name" colors={{ text, muted, pink, soft, border }} />
          <Field icon={Phone} label="Phone number" value={phone} onChangeText={(value) => { setPhone(value); setSaved(false); }} placeholder="+91 98765 43210" keyboardType="phone-pad" colors={{ text, muted, pink, soft, border }} />

          <View style={styles.field}>
            <Text style={[styles.label, { color: text }]}>Email address</Text>
            <View style={[styles.readOnly, { backgroundColor: soft, borderColor: border }]}>
              <Mail size={18} color={muted} />
              <Text style={[styles.readOnlyText, { color: muted }]}>{profile.email}</Text>
            </View>
            <Text style={[styles.helper, { color: muted }]}>Your login email cannot be changed from profile settings.</Text>
          </View>
        </View>

        <View style={[styles.saveBar, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.status}>
            {saved ? <><Check size={16} color="#16A34A" /><Text style={styles.savedText}>Profile updated</Text></> : <Text style={[styles.saveHint, { color: muted }]}>Saved changes update your account everywhere.</Text>}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            accessibilityState={{ disabled: saving || uploading, busy: saving }}
            disabled={saving || uploading}
            onPress={save}
            style={[styles.save, { backgroundColor: pink }, (saving || uploading) && { opacity: 0.6 }]}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <><Save size={17} color="#FFF" /><Text style={styles.saveText}>Save changes</Text></>}
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <SquareImageEditor
        kind="profile"
        asset={photoEditorAsset}
        busy={uploading}
        onCancel={() => setPhotoEditorAsset(null)}
        onSave={saveEditedPhoto}
      />
    </SafeAreaView>
  );
}

type FieldColors = { text: string; muted: string; pink: string; soft: string; border: string };

type FieldProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps["keyboardType"];
  colors: FieldColors;
};

function Field({ icon: Icon, label, value, onChangeText, placeholder, keyboardType = "default", colors }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.soft, borderColor: colors.border }]}>
        <Icon size={18} color={colors.pink} />
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} style={[styles.input, { color: colors.text }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: typeScale.cardTitle, fontWeight: "700" },
  headerHint: { fontSize: typeScale.caption, marginTop: 2 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingTop: 23, paddingBottom: 45 },
  intro: { marginBottom: 18 },
  eyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.5, marginBottom: 6 },
  title: { ...typeStyles.pageTitle },
  subtitle: { fontSize: typeScale.metadata, lineHeight: typeLeading.bodyCompact, marginTop: 5, maxWidth: 600 },
  card: { borderWidth: 1, borderRadius: 24, padding: 17 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 15 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 42 },
  camera: { position: "absolute", right: -1, bottom: 0, width: 30, height: 30, borderRadius: 15, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  photoTitle: { fontSize: typeScale.body, fontWeight: "700" },
  photoHint: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 4 },
  removePhoto: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 7 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 18 },
  field: { marginBottom: 15 },
  label: { fontSize: typeScale.caption, fontWeight: "700", marginBottom: 7 },
  inputWrap: { minHeight: 51, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, minWidth: 0, height: 49, fontSize: typeScale.body },
  readOnly: { minHeight: 51, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  readOnlyText: { flex: 1, fontSize: typeScale.body },
  helper: { fontSize: typeScale.caption, marginTop: 5 },
  saveBar: { borderWidth: 1, borderRadius: 20, padding: 12, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  status: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  saveHint: { fontSize: typeScale.caption },
  savedText: { color: "#16A34A", fontSize: typeScale.caption, fontWeight: "700" },
  save: { minWidth: 154, minHeight: 47, paddingHorizontal: 17, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
});
