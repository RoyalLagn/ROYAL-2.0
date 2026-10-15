import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { isVendorSectionActive } from "@/vendor/navigation";
import {
  AlertCircle,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  MapPin,
  Palette,
  Phone,
  Plus,
  Sparkles,
  Tag,
} from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import {
  useVendorWorkspace,
  VendorReadinessLabels,
  type CompletionItem,
  type CompletionState,
} from "@/hooks/useVendorWorkspace";
import ChecklistItem, {
  ReadinessChecklistGrid,
} from "@/components/vendor/ChecklistItem";
import { typeScale, typeLeading } from "@/constants/typography";

const SECTION_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  business: Building2,
  about: FileText,
  location: MapPin,
  contact: Phone,
  identity: Palette,
  services: Layers,
  portfolio: Camera,
  availability: Calendar,
  tags: Tag,
};

const STATUS_ICONS: Record<CompletionState, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  complete: Check,
  partial: Clock,
  attention: AlertCircle,
  missing: Plus,
};

type Props = {
  style?: ViewStyle;
  onOpenCurrent?: () => void;
  /** Section whose editor is open on this page. Its card holds `activePanel`. */
  activeSectionId?: string;
  activePanel?: React.ReactNode;
};

export default function VendorProfileReadinessCard({ style, onOpenCurrent, activeSectionId, activePanel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const isDark = colorScheme === "dark";
  const { completion } = useVendorWorkspace();

  const { items, percent } = completion;
  const completedCount = items.filter((item) => item.state === "complete").length;
  const isFullyReady = percent === 100;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBadge, { backgroundColor: isDark ? "rgba(231, 60, 120, 0.2)" : "#FFF0F6" }]}>
            <Sparkles size={20} color={colors.pink} />
          </View>
          <View style={styles.headerTitles}>
            <Text style={[styles.mainTitle, { color: colors.text }]}>
              Profile readiness
            </Text>
            <Text style={[styles.mainSubtitle, { color: colors.muted }]}>
              Keep your profile complete and accurate to attract more wedding bookings.
            </Text>
          </View>
        </View>

        <View style={[styles.percentPill, { backgroundColor: colors.pink }]}>
          <Text style={styles.percentPillText}>{percent}% READY</Text>
        </View>
      </View>

      {/* Progress Bar & Strength Section */}
      <View
        style={[
          styles.strengthCard,
          {
            backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : colors.surfaceSoft,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.strengthHeader}>
          <Text style={[styles.strengthTitle, { color: colors.text }]}>
            Profile strength
          </Text>
          <Text style={[styles.strengthCount, { color: colors.pink }]}>
            {completedCount} of {items.length} sections complete
          </Text>
        </View>

        {/* Progress Track */}
        <View style={[styles.progressTrack, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(4, Math.min(100, percent))}%`,
                backgroundColor: colors.pink,
              },
            ]}
          />
        </View>

        {/* Status Callout Banner */}
        <View
          style={[
            styles.statusBanner,
            isFullyReady
              ? {
                  backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5",
                  borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#A7F3D0",
                }
              : {
                  backgroundColor: isDark ? "rgba(231, 60, 120, 0.12)" : "#FFF1F5",
                  borderColor: isDark ? "rgba(231, 60, 120, 0.25)" : "#FFE0EC",
                },
          ]}
        >
          {isFullyReady ? (
            <CheckCircle2 size={16} color={isDark ? "#34D399" : "#059669"} style={styles.bannerIcon} />
          ) : (
            <AlertCircle size={16} color={colors.pink} style={styles.bannerIcon} />
          )}
          <Text
            style={[
              styles.bannerText,
              {
                color: isFullyReady
                  ? isDark
                    ? "#A7F3D0"
                    : "#065F46"
                  : isDark
                    ? "#FDA4AF"
                    : "#9F1239",
              },
            ]}
          >
            {isFullyReady
              ? "Your business profile is fully ready. Clients can view all your details and make bookings."
              : "Complete the remaining sections to maximize client trust and boost your visibility in search results."}
          </Text>
        </View>
      </View>

      {/* Checklist Header */}
      <View style={styles.checklistSectionHeader}>
        <Text style={[styles.checklistSectionTitle, { color: colors.text }]}>
          Readiness checklist
        </Text>
        <Text style={[styles.checklistSectionSubtitle, { color: colors.muted }]}>
          Click any section below to review or update its details.
        </Text>
      </View>

      <ReadinessChecklistGrid>
        {(itemWidth) =>
          items.map((item: CompletionItem) => {
            const SectionIcon = SECTION_ICONS[item.id] || Building2;
            const StatusIcon = STATUS_ICONS[item.state] || Plus;
            const meta = {
              label: VendorReadinessLabels[item.state],
              icon: StatusIcon,
            };
            const isOpen = Boolean(activePanel) && item.id === activeSectionId;

            return (
              <React.Fragment key={item.id}>
                <ChecklistItem
                  item={item}
                  meta={meta}
                  sectionIcon={SectionIcon}
                  colors={colors}
                  itemWidth={itemWidth}
                  highlighted={isOpen}
                  onPress={() => {
                    if (isVendorSectionActive(pathname, item.route)) {
                      onOpenCurrent?.();
                      return;
                    }
                    router.push(item.route as any);
                  }}
                />
                {isOpen ? (
                  <View style={[styles.editorPop, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : colors.background, borderColor: colors.border }]}>
                    {activePanel}
                  </View>
                ) : null}
              </React.Fragment>
            );
          })
        }
      </ReadinessChecklistGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
    flexBasis: "100%",
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitles: {
    flex: 1,
  },
  mainTitle: {
    fontSize: typeScale.sectionTitle,
    fontWeight: "800",
    lineHeight: typeLeading.sectionTitle,
    letterSpacing: -0.3,
  },
  mainSubtitle: {
    fontSize: typeScale.bodyCompact,
    lineHeight: typeLeading.bodyCompact,
    marginTop: 4,
  },
  percentPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    alignSelf: "flex-start",
    shadowColor: "#E73C78",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 2,
  },
  percentPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  strengthCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 24,
  },
  strengthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  strengthTitle: {
    fontSize: typeScale.bodyCompact,
    fontWeight: "700",
  },
  strengthCount: {
    fontSize: typeScale.caption,
    fontWeight: "700",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 14,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  bannerIcon: {
    flexShrink: 0,
  },
  bannerText: {
    fontSize: typeScale.caption,
    fontWeight: "600",
    lineHeight: typeLeading.caption,
    flex: 1,
  },
  checklistSectionHeader: {
    marginBottom: 14,
  },
  checklistSectionTitle: {
    fontSize: typeScale.cardTitle,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  checklistSectionSubtitle: {
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
    marginTop: 4,
  },
  editorPop: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
});
