import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  FileText,
  Heart,
  HelpCircle,
  ImagePlus,
  Info,
  Plus,
  Save,
  Send,
  Settings2,
  Shield,
  UserRound,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ThemeToggle } from "@/components/ThemeToggle";
import VendorHeader from "@/components/vendor/VendorHeader";
import CompactSearchBar from "@/components/listing/CompactSearchBar";

export type FrontendScreenMode =
  | "form"
  | "settings"
  | "list"
  | "gallery"
  | "help"
  | "info"
  | "reports";

type Field = { key: string; label: string; value: string };

type FrontendScreenProps = {
  title: string;
  subtitle: string;
  mode: FrontendScreenMode;
  fields?: Field[];
  items?: string[];
  content?: string[];
  onItemPress?: (item: string) => void;
};

const modeLabels: Record<FrontendScreenMode, string> = {
  form: "Personal details",
  settings: "Preferences",
  list: "Management",
  gallery: "Media",
  help: "Support",
  info: "RoyalLagn information",
  reports: "Overview",
};

export default function FrontendScreen({
  title,
  subtitle,
  mode,
  fields = [],
  items = [],
  content = [],
  onItemPress,
}: FrontendScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isVendorWorkspace = [
    "/vendoreditprofile", "/vendorservices", "/vendornotifications",
    "/vendorsettings", "/vendorhelp", "/vendorsubscription",
    "/vendorprivacypolicy", "/vendorterms",
  ].some((route) => pathname.toLowerCase().startsWith(route));
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 900;
  const isTablet = width >= 700;
  const pagePadding = width >= 768 ? 32 : 20;
  const contentMaxWidth = mode === "list" || mode === "reports" ? 1120 : 920;
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.key, field.value]))
  );
  const [list, setList] = useState(items);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((item) => [item, true]))
  );
  const settingsStorageKey = `royallagn.frontend-settings.${title}`;

  // Preferences here have no backing account column yet -- persisting them
  // locally at least means a toggle survives a reload instead of silently
  // resetting to "on" every time this screen mounts.
  useEffect(() => {
    if (mode !== "settings") return;
    let active = true;
    AsyncStorage.getItem(settingsStorageKey)
      .then((raw) => {
        if (!active || !raw) return;
        const stored = JSON.parse(raw) as Record<string, boolean>;
        setSettings((current) => ({ ...current, ...stored }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [mode, settingsStorageKey]);

  useEffect(() => {
    if (mode !== "settings") return;
    void AsyncStorage.setItem(settingsStorageKey, JSON.stringify(settings)).catch(() => undefined);
  }, [mode, settings, settingsStorageKey]);

  const filtered = list.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  const save = () => Alert.alert(title, "Your changes were saved locally.");
  const sendSupportMessage = async () => {
    const body = message.trim();
    if (!body) return Alert.alert("Add a message", "Let us know what you need help with first.");
    const url = `mailto:support@royallagn.com?subject=${encodeURIComponent(`${title} support`)}&body=${encodeURIComponent(body)}`;
    if (await Linking.canOpenURL(url)) {
      Linking.openURL(url);
      setMessage("");
    } else {
      Alert.alert("Email support", "Contact support@royallagn.com");
    }
  };

  const surfaceShadow = Platform.OS === "web"
    ? ({
        boxShadow: isDark
          ? "0 14px 36px rgba(0,0,0,0.17)"
          : "0 14px 36px rgba(116,62,86,0.07)",
      } as never)
    : styles.nativeShadow;

  const BannerIcon = mode === "form"
    ? UserRound
    : mode === "settings"
      ? Settings2
      : mode === "help"
        ? HelpCircle
        : mode === "info"
          ? title.includes("Privacy")
            ? Shield
            : title.includes("Terms")
              ? FileText
              : Heart
          : Info;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={isVendorWorkspace ? ["left", "right"] : ["top", "left", "right"]}>
      {isVendorWorkspace ? <VendorHeader /> : <View className="w-full bg-card/95 border-b border-border/80">
        <View
          style={[styles.topBar, { paddingHorizontal: pagePadding, maxWidth: 1184 }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="w-11 h-11 rounded-full bg-muted border border-border/70 items-center justify-center hover:bg-secondary active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-200"
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} className="text-foreground" />
          </Pressable>
          <View className="flex-1 px-3">
            <Text className="text-foreground text-base font-bold tracking-tight" numberOfLines={1}>
              Royal<Text className="text-primary">Lagn</Text>
            </Text>
          </View>
          <ThemeToggle />
        </View>
      </View>}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: pagePadding,
            paddingBottom: 40,
          },
        ]}
      >
        <View style={[styles.content, { maxWidth: contentMaxWidth }]}>
          <LinearGradient
            colors={isDark
              ? ["#2A2025", "#231C20", "#1E1E1E"]
              : ["#FFF8FB", "#FDE7F1", "#FFFDFE"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.banner, surfaceShadow]}
          >
            <View style={styles.bannerAccent} />
            <View
              style={[
                styles.bannerOrb,
                { backgroundColor: isDark ? "rgba(236,72,153,0.09)" : "rgba(233,30,99,0.07)" },
              ]}
            />
            <View className={isTablet ? "flex-row items-center" : "items-start"}>
              <View className="w-12 h-12 rounded-2xl bg-primary items-center justify-center mr-4 mb-3">
                <BannerIcon size={22} color="#FFFFFF" strokeWidth={1.9} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-primary text-2xs font-bold uppercase tracking-[1.5px] mb-1.5">
                  {modeLabels[mode]}
                </Text>
                <Text className={isDesktop
                  ? "text-foreground font-inter-bold text-page-title mb-1"
                  : "text-foreground font-inter-bold text-page-title mb-1"}
                >
                  {title}
                </Text>
                <Text className="text-muted-foreground text-sm leading-5">{subtitle}</Text>
              </View>
            </View>
          </LinearGradient>

          {mode === "form" && (
            <View
              className="bg-card border border-border/80 rounded-3xl p-5 md:p-6"
              style={surfaceShadow}
            >
              <View className="mb-5">
                <Text className="text-foreground text-lg font-bold mb-1">Personal information</Text>
                <Text className="text-muted-foreground text-xs">
                  Keep your contact details accurate and up to date.
                </Text>
              </View>
              <View style={styles.fieldGrid}>
                {fields.map((field) => (
                  <View
                    key={field.key}
                    style={{ width: isTablet ? "48.5%" : "100%" }}
                  >
                    <Text className="text-xs text-foreground font-semibold mb-2">{field.label}</Text>
                    <TextInput
                      className="h-12 bg-muted border border-border/70 rounded-xl px-4 text-foreground focus:border-primary/50 focus:outline-none transition-colors duration-200"
                      value={values[field.key]}
                      onChangeText={(value) =>
                        setValues((current) => ({ ...current, [field.key]: value }))
                      }
                      accessibilityLabel={field.label}
                    />
                  </View>
                ))}
              </View>
              <View className="mt-6 pt-5 border-t border-border/70 flex-row justify-end">
                <Pressable
                  accessibilityRole="button"
                  className="min-h-11 px-6 bg-primary rounded-full flex-row items-center justify-center hover:bg-primary/90 hover:-translate-y-0.5 active:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all duration-200"
                  onPress={save}
                >
                  <Save size={17} color="#FFFFFF" />
                  <Text className="text-white font-semibold ml-2">Save Changes</Text>
                </Pressable>
              </View>
            </View>
          )}

          {(mode === "list" || mode === "reports") && (
            <>
              <View className="flex-row gap-3">
                <CompactSearchBar
                  placeholder={`Search ${title.toLowerCase()}...`}
                  value={query}
                  dark={isDark}
                  accessibilityLabel={`Search ${title.toLowerCase()}`}
                  onChangeText={setQuery}
                  style={{ flex: 1 }}
                />
                <Pressable
                  accessibilityRole="button"
                  className="w-12 h-12 bg-primary rounded-xl items-center justify-center active:opacity-80"
                  onPress={() => {
                    const next = `${title.replace(/ Management$/, "")} ${list.length + 1}`;
                    setList((current) => [...current, next]);
                  }}
                >
                  <Plus size={20} color="#FFFFFF" />
                </Pressable>
              </View>
              <View className="bg-card border border-border rounded-2xl overflow-hidden" style={surfaceShadow}>
                {filtered.map((item, index) => (
                  <Pressable
                    key={`${item}-${index}`}
                    className={`min-h-[72px] flex-row items-center p-4 hover:bg-muted/50 active:bg-muted/70 ${
                      index < filtered.length - 1 ? "border-b border-border" : ""
                    }`}
                    onPress={() =>
                      onItemPress ? onItemPress(item) : Alert.alert(item, "Frontend details opened.")
                    }
                  >
                    <View className="flex-1">
                      <Text className="text-foreground font-medium">{item}</Text>
                      <Text className="text-xs text-muted-foreground mt-1">Tap to view or manage</Text>
                    </View>
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {mode === "settings" && (
            <View className={isDesktop ? "flex-row gap-6 items-start" : "gap-5"}>
              <View className={isDesktop ? "w-[32%]" : "w-full"}>
                <Text className="text-foreground text-lg font-bold mb-2">Your preferences</Text>
                <Text className="text-muted-foreground text-sm leading-5">
                  Choose how RoyalLagn communicates with you and personalizes your experience.
                </Text>
              </View>
              <View
                className={isDesktop
                  ? "flex-1 bg-card border border-border/80 rounded-3xl overflow-hidden"
                  : "w-full bg-card border border-border/80 rounded-2xl overflow-hidden"}
                style={surfaceShadow}
              >
                {items.map((item, index) => (
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: settings[item] }}
                    key={item}
                    className={`min-h-[76px] flex-row items-center px-4 py-3 hover:bg-muted/45 active:bg-muted/65 transition-colors duration-200 ${
                      index < items.length - 1 ? "border-b border-border/70" : ""
                    }`}
                    onPress={() => {
                      if (onItemPress) {
                        onItemPress(item);
                        return;
                      }
                      setSettings((current) => ({ ...current, [item]: !current[item] }));
                    }}
                  >
                    <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mr-3">
                      {index === 0 ? (
                        <Bell size={18} className="text-primary" />
                      ) : (
                        <Settings2 size={18} className="text-primary" />
                      )}
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-body font-semibold">{item}</Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">
                        {settings[item] ? "Enabled" : "Disabled"}
                      </Text>
                    </View>
                    <View className={`w-12 h-7 rounded-full p-1 ${settings[item] ? "bg-primary" : "bg-muted"}`}>
                      <View className={`w-5 h-5 rounded-full bg-white shadow-sm ${settings[item] ? "self-end" : "self-start"}`} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {mode === "gallery" && (
            <>
              <View className="flex-row flex-wrap gap-3">
                {list.map((item, index) => (
                  <Pressable
                    key={`${item}-${index}`}
                    className="w-[47%] h-32 bg-card border border-border rounded-2xl items-center justify-center hover:border-primary/35 active:opacity-80"
                    onPress={() => Alert.alert(item, "Gallery item selected.")}
                  >
                    <ImagePlus size={28} className="text-primary" />
                    <Text className="text-foreground text-sm mt-2">{item}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                className="min-h-11 bg-primary rounded-full px-6 self-center flex-row items-center justify-center active:opacity-80"
                onPress={() => setList((current) => [...current, `Gallery ${current.length + 1}`])}
              >
                <Plus size={18} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">Add Media</Text>
              </Pressable>
            </>
          )}

          {mode === "help" && (
            <View className={isDesktop ? "flex-row gap-6 items-start" : "gap-6"}>
              <View
                className={isDesktop
                  ? "w-[42%] bg-card border border-border/80 rounded-3xl overflow-hidden"
                  : "w-full bg-card border border-border/80 rounded-2xl overflow-hidden"}
                style={surfaceShadow}
              >
                <View className="px-5 pt-5 pb-3">
                  <Text className="text-foreground text-lg font-bold">Popular help topics</Text>
                  <Text className="text-muted-foreground text-xs mt-1">Choose a topic to learn more</Text>
                </View>
                {items.map((item, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item}
                    className={`min-h-[64px] px-5 flex-row items-center hover:bg-muted/50 active:bg-muted/70 ${
                      index > 0 ? "border-t border-border/70" : ""
                    }`}
                    onPress={() => Alert.alert(item, "Help article opened.")}
                  >
                    <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center mr-3">
                      <HelpCircle size={16} className="text-primary" />
                    </View>
                    <Text className="text-foreground text-sm font-medium flex-1">{item}</Text>
                    <ChevronRight size={17} className="text-muted-foreground" />
                  </Pressable>
                ))}
              </View>

              <View
                className="flex-1 bg-card border border-border/80 rounded-3xl p-5"
                style={surfaceShadow}
              >
                <Text className="text-foreground text-lg font-bold mb-1">Still need help?</Text>
                <Text className="text-muted-foreground text-xs mb-4">
                  Tell us what you need and our support team will guide you.
                </Text>
                <TextInput
                  className="bg-muted border border-border/70 rounded-2xl px-4 py-3 text-foreground min-h-32 focus:border-primary/50 focus:outline-none"
                  placeholder="How can we help?"
                  placeholderTextColor={isDark ? "#8D878A" : "#8B7D83"}
                  multiline
                  textAlignVertical="top"
                  value={message}
                  onChangeText={setMessage}
                  accessibilityLabel="Support message"
                />
                <Pressable
                  accessibilityRole="button"
                  className="min-h-11 mt-4 px-6 self-end bg-primary rounded-full flex-row items-center justify-center hover:bg-primary/90 active:opacity-85"
                  onPress={() => void sendSupportMessage()}
                >
                  <Send size={17} color="#FFFFFF" />
                  <Text className="text-white font-semibold ml-2">Send Message</Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === "info" && (
            <View className={isDesktop ? "flex-row gap-6 items-start" : "gap-5"}>
              <View className={isDesktop ? "w-[30%]" : "w-full"}>
                <View className="w-10 h-0.5 bg-primary rounded-full mb-4" />
                <Text className="text-foreground text-lg font-bold mb-2">Important information</Text>
                <Text className="text-muted-foreground text-sm leading-5">
                  Please read this information carefully when using RoyalLagn.
                </Text>
              </View>
              <View
                className="flex-1 bg-card border border-border/80 rounded-3xl overflow-hidden"
                style={surfaceShadow}
              >
                {content.map((paragraph, index) => (
                  <View
                    key={index}
                    className={`p-5 flex-row items-start ${index > 0 ? "border-t border-border/70" : ""}`}
                  >
                    <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center mr-3 mt-0.5">
                      <Text className="text-primary text-xs font-bold">{index + 1}</Text>
                    </View>
                    <Text className="text-foreground text-sm leading-6 flex-1">{paragraph}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className="items-center pt-2 pb-3">
            <View className="w-8 h-0.5 rounded-full bg-primary/30 mb-3" />
            <Text className="text-muted-foreground text-xs">RoyalLagn  •  Premium wedding marketplace</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    width: "100%",
    alignSelf: "center",
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
  },
  scrollContent: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 40,
  },
  content: {
    width: "100%",
    gap: 24,
  },
  banner: {
    width: "100%",
    minHeight: 152,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(233,30,99,0.14)",
    padding: 24,
    overflow: "hidden",
    justifyContent: "center",
  },
  bannerAccent: {
    position: "absolute",
    left: 28,
    top: 0,
    width: 120,
    height: 3,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: "#E91E63",
  },
  bannerOrb: {
    position: "absolute",
    right: -70,
    top: -55,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  fieldGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  nativeShadow: {
    shadowColor: "#5D2A41",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
});
