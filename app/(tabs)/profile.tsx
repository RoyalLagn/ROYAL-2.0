import React, { useEffect, useState } from "react";
import PageLoader from "@/components/loading/PageLoader";
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  Edit,
  Heart,
  HelpCircle,
  LogOut,
  Phone,
  Shield,
  Ticket,
  Trash2,
  User,
  X,
} from "lucide-react-native";
import {
  MediaError,
  deleteManagedProfileImage,
  pickProfileImage,
  uploadProfileImage,
  type ProfileImageAsset,
} from "@/services/media";
import { getPublicAuthError, updatePublicProfile } from "@/services/publicAuth";
import { useAppTheme } from "@/components/ThemeProvider";
import { usePublicAuth } from "@/context/PublicAuthContext";
import SquareImageEditor from "@/components/vendor/SquareImageEditor";
import Pressable from "@/components/InteropSafePressable";
import { AccountOption, mobilePressedScale, SectionHeading } from "@/components/profile/ProfileScreenParts";
import { profileScreenStyles as styles } from "@/components/profile/profileScreenStyles";
import { isNativeTabletWindow, isPublicWideLayout } from "@/utils/responsiveLayout";

export default function ProfileScreen() {
  const router = useRouter();
  const { session, profile, loading: authLoading, isPublicAuthenticated, refreshProfile, signOut } = usePublicAuth();
  const { width, height } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isTablet = isNativeTabletWindow(width, height);
  const isDesktop = isPublicWideLayout(width, height) || width >= 900;
  const pagePadding = width >= 768 ? 32 : 20;
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(profile?.profile_image ?? null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoEditorAsset, setPhotoEditorAsset] = useState<ProfileImageAsset | null>(null);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [isConfirmingPhotoRemoval, setIsConfirmingPhotoRemoval] = useState(false);
  const entryProgress = useSharedValue(0);
  const avatarScale = useSharedValue(0.96);
  const editIconOpacity = useSharedValue(0);
  const user = {
    name: profile?.full_name || "RoyalLagn User",
    email: profile?.email || "",
    phone: profile?.phone || "Not provided",
  };

  useEffect(() => {
    if (!authLoading && !isPublicAuthenticated) {
      router.replace("/DashboardCenter");
    }
  }, [authLoading, isPublicAuthenticated, router]);

  useEffect(() => {
    setProfileImageUrl(profile?.profile_image ?? null);
  }, [profile?.profile_image]);

  useEffect(() => {
    const easeOut = Easing.out(Easing.cubic);

    entryProgress.value = withTiming(1, {
      duration: 320,
      easing: easeOut,
    });
    avatarScale.value = withTiming(1, {
      duration: 280,
      easing: easeOut,
    });
    editIconOpacity.value = withDelay(
      140,
      withTiming(1, {
        duration: 220,
        easing: easeOut,
      })
    );
  }, [avatarScale, editIconOpacity, entryProgress]);

  const entryAnimatedStyle = useAnimatedStyle(() => ({
    opacity: entryProgress.value,
    transform: [{ translateY: (1 - entryProgress.value) * 10 }],
  }));

  const avatarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  const editIconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: editIconOpacity.value,
  }));

  const surfaceShadow = Platform.OS === "web"
    ? ({
        boxShadow: isDark
          ? "0 14px 36px rgba(0,0,0,0.18)"
          : "0 14px 36px rgba(116,62,86,0.07)",
      } as never)
    : styles.nativeShadow;

  const editProfilePhoto = async () => {
    if (isUploadingPhoto) return;

    setIsUploadingPhoto(true);
    try {
      const asset = await pickProfileImage();
      if (asset) setPhotoEditorAsset(asset);
    } catch (error) {
      Alert.alert(
        "Photo selection failed",
        error instanceof MediaError
          ? error.message
          : getPublicAuthError(error, "Unable to open the selected photo. Please try again.")
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const saveEditedProfilePhoto = async (asset: ProfileImageAsset) => {
    if (!session?.user.id) return;
    const previousUrl = profileImageUrl;
    setIsUploadingPhoto(true);
    try {
      const uploadedUrl = await uploadProfileImage({ kind: "customer" }, asset);
      try {
        await updatePublicProfile(session.user.id, { profileImage: uploadedUrl });
      } catch (error) {
        await deleteManagedProfileImage({ kind: "customer" }, uploadedUrl).catch(() => undefined);
        throw error;
      }
      await refreshProfile();
      setProfileImageUrl(uploadedUrl);
      setPhotoEditorAsset(null);
      if (previousUrl && previousUrl !== uploadedUrl) {
        await deleteManagedProfileImage({ kind: "customer" }, previousUrl).catch(() => {
          Alert.alert("Photo updated", "Your new photo is saved, but the previous image could not be cleaned up yet.");
        });
      }
    } catch (error) {
      Alert.alert(
        "Photo upload failed",
        error instanceof MediaError
          ? error.message
          : getPublicAuthError(error, "Unable to save the edited photo. Please try again.")
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removeProfilePhoto = async () => {
    if (!session?.user.id || isUploadingPhoto) return;
    const previousUrl = profileImageUrl;
    setIsUploadingPhoto(true);
    try {
      await updatePublicProfile(session.user.id, { profileImage: null });
      await refreshProfile();
      setProfileImageUrl(null);
      await deleteManagedProfileImage({ kind: "customer" }, previousUrl).catch(() => {
        Alert.alert("Photo removed", "Your profile was updated, but the previous image could not be cleaned up yet.");
      });
      setIsConfirmingPhotoRemoval(false);
      setIsPhotoViewerVisible(false);
    } catch (error) {
      Alert.alert("Photo not removed", getPublicAuthError(error, "Unable to remove your profile photo."));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const openPhotoViewer = () => {
    setIsConfirmingPhotoRemoval(false);
    setIsPhotoViewerVisible(true);
  };

  const closePhotoViewer = () => {
    setIsConfirmingPhotoRemoval(false);
    setIsPhotoViewerVisible(false);
  };

  const logout = async () => {
    try {
      await signOut();
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Logout failed", "Unable to log out right now. Please try again.");
    }
  };

  const accountOptions = [
    {
      icon: Ticket,
      title: "My Bookings & Tickets",
      description: "View confirmed bookings, status & luxury E-tickets",
      onPress: () => router.push("/(tabs)/bookings"),
    },
    {
      icon: Heart,
      title: "Favorites",
      description: "View your saved vendors and shortlisted services",
      onPress: () => router.push("/(tabs)/favorites"),
    },
    {
      icon: User,
      title: "Personal Information",
      description: "Update your name and profile details",
      onPress: () => router.push("/EditProfile"),
    },
    {
      icon: Shield,
      title: "Privacy & Security",
      description: "Review how RoyalLagn handles your information",
      onPress: () => router.push("/PrivacyPolicy"),
    },
    {
      icon: Bell,
      title: "Notifications",
      description: "Choose the updates you want to receive",
      onPress: () => router.push("/Settings"),
    },
    {
      icon: Trash2,
      title: "Delete account",
      description: "Request deletion of your RoyalLagn account",
      onPress: () => router.push("/account-deletion"),
    },
  ];

  const supportOptions = [
    {
      icon: HelpCircle,
      title: "Help Center",
      description: "Find answers and guidance",
      onPress: () => router.push("/Help"),
    },
    {
      icon: Shield,
      title: "Terms & Conditions",
      description: "Review service terms and policies",
      onPress: () => router.push("/Terms"),
    },
  ];

  const hero = (
    <LinearGradient
      colors={isDark
        ? ["#2A2025", "#231C20", "#1E1E1E"]
        : ["#FFF8FB", "#FDE7F1", "#FFFDFE"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, surfaceShadow]}
    >
      <View style={styles.heroAccent} />
      <View
        style={[
          styles.decorativeCircleLarge,
          { backgroundColor: isDark ? "rgba(236,72,153,0.08)" : "rgba(233,30,99,0.07)" },
        ]}
      />
      <View
        style={[
          styles.decorativeCircleSmall,
          { borderColor: isDark ? "rgba(236,72,153,0.15)" : "rgba(233,30,99,0.14)" },
        ]}
      />

      <View className="items-center relative z-10">
        <Text className="text-primary text-2xs font-bold uppercase tracking-[1.6px] mb-4">
          My account
        </Text>
        <Animated.View className="relative mb-4" style={avatarAnimatedStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View profile photo"
            onPress={openPhotoViewer}
            disabled={isUploadingPhoto}
            className="rounded-full active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-opacity duration-200"
          >
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={[
                  styles.avatar,
                  isDesktop && styles.avatarDesktop,
                  { borderColor: isDark ? "#4B3440" : "#F9BBD5" },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  isDesktop && styles.avatarDesktop,
                  styles.avatarPlaceholder,
                  { borderColor: isDark ? "#4B3440" : "#F9BBD5" },
                ]}
              >
                <User size={isDesktop ? 42 : 36} className="text-primary" />
              </View>
            )}
          </Pressable>
          <Animated.View style={[styles.editPhotoAction, editIconAnimatedStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit profile photo"
              hitSlop={Platform.OS === "android" ? 6 : 4}
              className="w-9 h-9 bg-primary rounded-full items-center justify-center border-[3px] border-card hover:bg-[#D81B60] active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors duration-200 ease-out"
              style={mobilePressedScale}
              onPress={openPhotoViewer}
              disabled={isUploadingPhoto}
            >
              <Edit size={15} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          </Animated.View>
        </Animated.View>

        <Text className={isDesktop
          ? "text-foreground text-2xl font-bold text-center mb-1"
          : "text-foreground text-xl font-bold text-center mb-1"}
        >
          {user.name}
        </Text>
        <Text className="text-muted-foreground text-sm text-center mb-5">
          {user.email}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/EditProfile")}
          className="h-11 px-7 rounded-full bg-primary items-center justify-center hover:bg-[#D81B60] hover:-translate-y-px active:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all duration-200 ease-out"
          style={mobilePressedScale}
        >
          <View className="flex-row items-center">
            <Edit size={15} color="#FFFFFF" className="mr-2" />
            <Text className="text-primary-foreground text-sm font-semibold">Edit Profile</Text>
          </View>
        </Pressable>
      </View>

      <View className="mt-6 rounded-2xl overflow-hidden border border-primary/10 bg-card/55 relative z-10">
        <View className="min-h-[64px] px-4 flex-row items-center">
          <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mr-3">
            <Phone size={17} className="text-primary" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-muted-foreground text-2xs uppercase tracking-wider mb-0.5">Phone</Text>
            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{user.phone}</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      {authLoading ? <PageLoader /> : null}
      {(!isDesktop || isTablet) ? (
        <View style={[styles.mobileHeader, { paddingHorizontal: pagePadding }]}>
          <View>
            <Text className="text-primary text-2xs font-bold uppercase tracking-[1.4px] mb-1">
              Account
            </Text>
            <Text className="text-2xl font-bold text-foreground">Profile</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: pagePadding },
        ]}
      >
        <Animated.View style={[styles.pageContainer, entryAnimatedStyle]}>
          {isDesktop && !isTablet ? (
            <View style={styles.pageIntro}>
              <Text className="text-muted-foreground text-xs font-medium mb-2">
                Account  /  Profile
              </Text>
              <Text className="text-foreground font-inter-bold text-page-title mb-1.5">
                My Account
              </Text>
              <Text className="text-muted-foreground text-sm">
                Manage your profile, preferences and support in one place.
              </Text>
            </View>
          ) : null}

          {isDesktop ? (
            <View style={[styles.desktopColumns, isTablet && styles.desktopColumnsTablet]}>
              <View style={[styles.leftColumn, isTablet && styles.leftColumnTablet]}>
                {hero}
                <Pressable
                  accessibilityRole="button"
                  onPress={logout}
                  className="self-start h-11 px-5 rounded-full border border-destructive/35 bg-destructive/5 flex-row items-center justify-center hover:bg-destructive/10 hover:-translate-y-px active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 transition-all duration-200 ease-out"
                  style={mobilePressedScale}
                >
                  <LogOut size={17} className="text-destructive mr-2" />
                  <Text className="text-destructive text-sm font-semibold">Log Out</Text>
                </Pressable>
              </View>

              <View style={styles.rightColumn}>
                <View style={[styles.desktopSectionColumns, isTablet && styles.desktopSectionColumnsTablet]}>
                  <View style={styles.desktopSectionColumn}>
                    <SectionHeading eyebrow="Account" title="Account settings" />
                    <View style={styles.desktopTileStack}>
                      {accountOptions.map((item) => (
                        <AccountOption
                          key={item.title}
                          {...item}
                          tile
                          tileWidth="100%"
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.desktopSectionColumn}>
                    <SectionHeading eyebrow="Support" title="Help & information" />
                    <View style={styles.desktopTileStack}>
                      {supportOptions.map((item) => (
                        <AccountOption
                          key={item.title}
                          {...item}
                          tile
                          tileWidth="100%"
                        />
                      ))}
                    </View>
                  </View>
                </View>

                <View className="pt-2 flex-row items-center justify-between border-t border-border/70">
                  <Text className="text-muted-foreground text-xs">RoyalLagn account</Text>
                  <Text className="text-muted-foreground text-xs">Version 1.0.0</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mobileStack}>
              {hero}

              <View>
                <Text className="text-foreground text-lg font-bold mb-1">Account settings</Text>
                <Text className="text-muted-foreground text-xs mb-3">
                  Your details, privacy and preferences
                </Text>
                <View
                  className={Platform.OS === "web" ? "bg-card rounded-2xl overflow-hidden border border-border/80" : undefined}
                  style={Platform.OS === "web"
                    ? surfaceShadow
                    : [styles.nativeSettingsGroup, isDark ? styles.nativeSurfaceDark : styles.nativeSurfaceLight]}
                >
                  {accountOptions.map((item, index) => (
                    <AccountOption
                      key={item.title}
                      {...item}
                      showNativeSeparator={index < accountOptions.length - 1}
                    />
                  ))}
                </View>
              </View>

              <View>
                <Text className="text-foreground text-lg font-bold mb-1">Help & information</Text>
                <Text className="text-muted-foreground text-xs mb-3">
                  Support, policies and contact options
                </Text>
                <View
                  className={Platform.OS === "web" ? "bg-card rounded-2xl overflow-hidden border border-border/80" : undefined}
                  style={Platform.OS === "web"
                    ? surfaceShadow
                    : [styles.nativeSettingsGroup, isDark ? styles.nativeSurfaceDark : styles.nativeSurfaceLight]}
                >
                  {supportOptions.map((item, index) => (
                    <AccountOption
                      key={item.title}
                      {...item}
                      showNativeSeparator={index < supportOptions.length - 1}
                    />
                  ))}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={logout}
                className="self-center h-11 px-6 rounded-full border border-destructive/35 bg-destructive/5 flex-row items-center justify-center active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
                style={mobilePressedScale}
              >
                <LogOut size={17} className="text-destructive mr-2" />
                <Text className="text-destructive text-sm font-semibold">Log Out</Text>
              </Pressable>

              <View className="items-center pt-1">
                <View className="w-8 h-0.5 rounded-full bg-primary/30 mb-3" />
                <Text className="text-muted-foreground text-xs">RoyalLagn  •  Version 1.0.0</Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <Modal
        visible={isPhotoViewerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePhotoViewer}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo preview"
            style={StyleSheet.absoluteFill}
            onPress={closePhotoViewer}
          />
          <View
            className="w-full max-w-[420px] bg-card border border-border rounded-3xl p-6"
            style={[styles.photoModal, surfaceShadow]}
          >
            <View className="flex-row items-center justify-between mb-5">
              <View>
                <Text className="text-primary text-2xs font-bold uppercase tracking-[1.4px] mb-1">
                  Profile photo
                </Text>
                <Text className="text-foreground text-xl font-bold">{user.name}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-11 h-11 rounded-full bg-muted items-center justify-center hover:bg-secondary active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onPress={closePhotoViewer}
              >
                <X size={20} className="text-foreground" />
              </Pressable>
            </View>

            <View className="items-center py-2">
              {profileImageUrl ? (
                <Image
                  source={{ uri: profileImageUrl }}
                  style={[
                    styles.previewAvatar,
                    { borderColor: isDark ? "#4B3440" : "#F9BBD5" },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.previewAvatar,
                    styles.avatarPlaceholder,
                    { borderColor: isDark ? "#4B3440" : "#F9BBD5" },
                  ]}
                >
                  <User size={76} className="text-primary" />
                </View>
              )}
            </View>

            {isConfirmingPhotoRemoval ? (
              <View className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
                <Text className="text-foreground text-sm font-bold mb-1">Remove profile photo?</Text>
                <Text className="text-muted-foreground text-xs leading-[18px] mb-4">
                  The photo will be removed from this profile preview.
                </Text>
                <View className="flex-row justify-end gap-3">
                  <Pressable
                    accessibilityRole="button"
                    className="h-11 px-5 rounded-full bg-muted items-center justify-center active:opacity-80"
                    onPress={() => setIsConfirmingPhotoRemoval(false)}
                  >
                    <Text className="text-foreground text-sm font-semibold">Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    className="h-11 px-5 rounded-full bg-destructive items-center justify-center active:opacity-80"
                    onPress={removeProfilePhoto}
                  >
                    <Text className="text-white text-sm font-semibold">Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="mt-6 rounded-2xl overflow-hidden border border-border/80">
                <Pressable
                  accessibilityRole="button"
                  className="min-h-[56px] px-4 flex-row items-center hover:bg-muted/50 active:bg-muted/70 border-b border-border/70"
                  onPress={() => {
                    closePhotoViewer();
                    void editProfilePhoto();
                  }}
                >
                  <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mr-3">
                    <Edit size={17} className="text-primary" />
                  </View>
                  <Text className="text-foreground text-sm font-semibold flex-1">Edit photo</Text>
                  <ChevronRight size={17} className="text-muted-foreground" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!profileImageUrl}
                  className={profileImageUrl
                    ? "min-h-[56px] px-4 flex-row items-center hover:bg-destructive/5 active:bg-destructive/10"
                    : "min-h-[56px] px-4 flex-row items-center opacity-40"}
                  onPress={() => setIsConfirmingPhotoRemoval(true)}
                >
                  <View className="w-9 h-9 rounded-xl bg-destructive/10 items-center justify-center mr-3">
                    <Trash2 size={17} className="text-destructive" />
                  </View>
                  <Text className="text-destructive text-sm font-semibold flex-1">Remove photo</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <SquareImageEditor
        kind="profile"
        asset={photoEditorAsset}
        busy={isUploadingPhoto}
        onCancel={() => setPhotoEditorAsset(null)}
        onSave={saveEditedProfilePhoto}
      />
    </SafeAreaView>
  );
}
