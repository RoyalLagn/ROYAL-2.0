import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle, } from "react-native";
// See VendorCalendar.tsx / AppDialogProvider.tsx / VendorProfileTabs.tsx:
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { ChevronRight, Images, RefreshCw } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PublicClip } from "@/clips/types";
import { PublicClipService } from "@/clips/services";
import { useFavorites } from "@/context/FavoritesContext";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import PackagesCard from "@/components/vendor-profile/PackagesCard";
import PackageDetailsModal from "@/components/packages/PackageDetailsModal";
import PackageEnquiryModal from "@/components/packages/PackageEnquiryModal";
import FullscreenMediaViewer from "@/components/vendor-profile/FullscreenMediaViewer";
import PortfolioAlbums from "@/components/vendor-profile/PortfolioAlbums";
import ServiceChips from "@/components/vendor-profile/ServiceChips";
import VendorHeroCarousel from "@/components/vendor-profile/VendorHeroCarousel";
import PinnedHeroProfileLayout from "@/components/vendor-profile/PinnedHeroProfileLayout";
import VendorInfoPanel from "@/components/vendor-profile/VendorInfoPanel";
import VendorQuickActions from "@/components/vendor-profile/VendorQuickActions";
import VendorAvailabilityModal from "@/components/vendor-profile/VendorAvailabilityModal";
import VendorClipsGrid from "@/components/vendor-profile/VendorClipsGrid";
import VendorClipsComingSoon from "@/components/vendor-profile/VendorClipsComingSoon";
import VendorClipsReelViewer from "@/components/vendor-profile/VendorClipsReelViewer";
import VendorProfileTabs, {
  type VendorProfileTab, } from "@/components/vendor-profile/VendorProfileTabs";
import { StandaloneMobileTabBar, useMobileTabBarHeight } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  getApprovedPublicVendorById, recordPublicVendorProfileView, subscribeToPublicVendorChanges, type PublicVendorListing, } from "@/services/publicVendorListings";
import { portfolioMediaUrl } from "@/services/vendorPortfolio";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import type { VendorPackage } from "@/services/vendorPackages";
import { EnquiryExternalOpenError, EnquiryService, type EnquiryChannel } from "@/services/enquiries";
import { shareVendorProfile } from "@/services/vendorShare";
import { recordVendorTrafficView } from "@/services/vendorPublicProfile";
import { resolveTrafficSource } from "@/services/trafficSource";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { SkeletonBone, SkeletonList } from "@/components/loading/Skeleton";
import PageLoader from "@/components/loading/PageLoader";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { MotionDistance, MotionTiming } from "@/utils/motion";
import { usePublicClipsAvailability } from "@/hooks/usePublicClipsAvailability";

const PINK = brandPalette.light.primary;

function enhanceImage(uri: string) {
  return uri.replace(/([?&])w=\d+/, "$1w=1200");
}

function SectionHeading({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <View style={styles.sectionHeadingWrap}>
      <Text style={[styles.sectionHeading, { color: dark ? "#F8F1F4" : "#261A20" }]}>{children}</Text>
      <View style={[styles.sectionHeadingRule, { backgroundColor: dark ? "#4E3640" : "#F2DDE5" }]} />
    </View>
  );
}

function ProfileTabPanel({ children }: React.PropsWithChildren) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, MotionTiming.fast);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{
      translateY: reducedMotion ? 0 : (1 - progress.value) * MotionDistance.cardEnter,
    }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function DesktopProfileReveal({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? 1
      : withDelay(40, withTiming(1, MotionTiming.base));
  }, [progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{
      translateY: reducedMotion ? 0 : (1 - progress.value) * MotionDistance.screenEnter,
    }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** A once-only, viewport-aware reveal for the profile's editorial chapters.
 * It keeps every section rendered and interactive while waiting to enter. */
function ProfileSectionReveal({
  children,
  scrollOffset,
  viewportHeight,
  delay = 0,
  style,
}: React.PropsWithChildren<{
  scrollOffset: number;
  viewportHeight: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const reducedMotion = useReducedMotion();
  const [sectionTop, setSectionTop] = useState<number | null>(null);
  const sectionRef = useRef<any>(null);
  const revealed = useRef(reducedMotion);
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (revealed.current || sectionTop === null) return;
    if (scrollOffset + viewportHeight * 0.9 < sectionTop) return;
    revealed.current = true;
    progress.value = withDelay(delay, withTiming(1, MotionTiming.base));
  }, [delay, progress, scrollOffset, sectionTop, viewportHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - progress.value) * MotionDistance.screenEnter }],
  }));

  return (
    <Animated.View
      ref={sectionRef}
      onLayout={() => {
        requestAnimationFrame(() => {
          sectionRef.current?.measureInWindow?.((_x: number, y: number) => {
            setSectionTop((current) => current ?? scrollOffset + y);
          });
        });
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}

export default function VendorsProfile() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const mobileTabBarHeight = useMobileTabBarHeight();
  const dark = colorScheme === "dark";
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 1100;
  const wideProfile = width >= 768;
  const splitDesktopContent = width >= 980;
  const params = useLocalSearchParams<{ vendorId?: string; category?: string; src?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const paramCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const explicitSource = Array.isArray(params.src) ? params.src[0] : params.src;
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [vendorReloadKey, setVendorReloadKey] = useState(0);
  const category = vendor?.category ?? paramCategory ?? "Photographers";
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { isPublicAuthenticated, loading: authLoading } = usePublicAuth();
  const [expanded, setExpanded] = useState(false);
  const [heroViewerIndex, setHeroViewerIndex] = useState<number | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [packagesVisible, setPackagesVisible] = useState(false);
  const [enquiryPackage, setEnquiryPackage] = useState<VendorPackage | null>(null);
  const [selectedTab, setSelectedTab] = useState<VendorProfileTab>("portfolio");
  const [vendorClips, setVendorClips] = useState<PublicClip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipsError, setClipsError] = useState("");
  const [clipsReloadKey, setClipsReloadKey] = useState(0);
  const [reelViewerIndex, setReelViewerIndex] = useState<number | null>(null);
  const publicClipsEnabled = usePublicClipsAvailability();
  const [profileScrollOffset, setProfileScrollOffset] = useState(0);
  const [desktopDetailScrollOffset, setDesktopDetailScrollOffset] = useState(0);
  const contactPromptVisible = useRef(false);
  const contactOpening = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    if (!vendorId) {
      setVendor(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    const load = () => {
      getApprovedPublicVendorById(vendorId)
        .then((result) => {
          if (active) setVendor(result);
        })
        .catch((error) => {
          if (active) {
            setVendor(null);
            setLoadError(error instanceof Error ? error.message : "Unable to load this vendor.");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    load();
    const unsubscribe = subscribeToPublicVendorChanges(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [vendorId, vendorReloadKey]);

  useEffect(() => {
    if (!vendor?.id) return;
    void recordPublicVendorProfileView(vendor.id).catch(() => {
      // Profile viewing must never block the public Vendor page.
    });
    const source = resolveTrafficSource(explicitSource);
    void recordVendorTrafficView(vendor.id, source).catch(() => {
      // Analytics must never block the public Vendor page.
    });
  }, [explicitSource, vendor?.id]);

  useEffect(() => {
    if (!vendorId) return;
    let active = true;
    setSelectedTab("portfolio");
    void AsyncStorage.getItem(`royallagn:vendor-profile-tab:${vendorId}`)
      .then((saved) => {
        if (active && (saved === "portfolio" || saved === "clips")) setSelectedTab(saved);
      })
      .catch(() => {
        // The in-memory selection still works when local persistence is unavailable.
      });
    return () => {
      active = false;
    };
  }, [vendorId]);

  useEffect(() => {
    if (!vendor?.id || publicClipsEnabled !== true) {
      setVendorClips([]);
      setClipsLoading(false);
      setClipsError("");
      setReelViewerIndex(null);
      return;
    }
    let active = true;
    setClipsLoading(true);
    setClipsError("");
    void PublicClipService.listVendor(vendor.id)
      .then((clips) => {
        if (active) setVendorClips(clips);
      })
      .catch((error) => {
        if (!active) return;
        setVendorClips([]);
        setClipsError(error instanceof Error ? error.message : "Unable to load this vendor's Clips.");
      })
      .finally(() => {
        if (active) setClipsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clipsReloadKey, publicClipsEnabled, vendor?.id]);

  const colors = brandColors(dark);
  const background = colors.background;
  const surface = colors.card;
  const text = colors.foreground;
  const muted = colors.mutedForeground;
  const sectionDivider = colors.border;
  const contentWidth = Math.min(width, 1120);
  const heroHeight = useMemo(() => {
    const usableHeight = Math.max(520, height - insets.top - insets.bottom);
    return desktop
      ? Math.max(420, Math.min(520, usableHeight * 0.5))
      : Math.max(300, Math.min(460, usableHeight * 0.42));
  }, [desktop, height, insets.bottom, insets.top]);
  const sectionCardStyle = { backgroundColor: surface, borderColor: sectionDivider };
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: "/VendorsListing",
      params: { category },
    });
  };

  const heroImages = useMemo(
    () => vendor
      ? vendor.heroMedia.length
        ? vendor.heroMedia.map((media) => ({ uri: portfolioMediaUrl(media, "hero") }))
        : [vendor.image].filter(Boolean).map((image) => ({ uri: enhanceImage(image) }))
      : [],
    [vendor],
  );
  const heroFocalPoints = useMemo(
    () => vendor?.heroMedia.map((media) => ({
      x: Number(media.focal_point_x ?? .5),
      y: Number(media.focal_point_y ?? .5),
    })) ?? [],
    [vendor],
  );

  if (loading || !vendor) {
    return (
      <View style={[styles.root, { backgroundColor: background }]}>
        {loading ? <PageLoader /> : null}
        <PublicWebNavbar activeRoute="Categories" />
        {loading ? (
          <View accessibilityLabel="Loading vendor profile" style={styles.loadingWrap}>
            <SkeletonBone width="100%" height={desktop ? 430 : 320} radius={0} />
            <View style={[styles.loadingContent, width < 600 && styles.contentCompact]}>
              <SkeletonBone width="62%" height={28} radius={8} />
              <SkeletonBone width="42%" height={12} radius={5} style={{ marginTop: 12 }} />
              <SkeletonList count={3} height={86} gap={14} />
            </View>
          </View>
        ) : (
          <View style={[styles.notFound, { backgroundColor: surface, borderColor: sectionDivider }]}>
            <View style={[styles.notFoundIcon, { backgroundColor: colors.muted }]}>
              <RefreshCw size={24} color={colors.primaryStrong} />
            </View>
            <Text style={[styles.notFoundTitle, { color: text }]}>Vendor is currently unavailable</Text>
            <Text style={[styles.loadError, { color: muted }]}>{loadError || "This profile may have been paused or is no longer public."}</Text>
            <View style={styles.recoveryActions}>
              {loadError ? (
                <Pressable accessibilityRole="button" onPress={() => setVendorReloadKey((current) => current + 1)} style={({ pressed, hovered }) => [styles.retry, hovered && Platform.OS === "web" && styles.retryHovered, pressed && styles.pressed]}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={goBack} style={({ pressed }) => [styles.goBack, pressed && styles.pressed]}>
                <Text style={[styles.goBackText, { color: colors.primaryStrong }]}>Back to vendors</Text>
              </Pressable>
            </View>
          </View>
        )}
        {!desktop ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}
      </View>
    );
  }

  const displayedRating = getRating(vendor.id, vendor.rating, vendor.reviews);
  const fallbackImage = resolveMarketplaceCategoryImage(category).fallbackSource;
  const vendorDescription = vendor.description?.trim() ?? "";
  const about = vendorDescription.length >= 40
    ? vendorDescription
    : `${vendor.name} is a verified ${category.toLowerCase()} professional serving ${vendor.location}. Explore their services, portfolio and customer reviews to find the right fit for your celebration.`;
  const aboutCopy = expanded || about.length <= 180 ? about : `${about.slice(0, 177).trim()}…`;
  const selectProfileTab = (tab: VendorProfileTab) => {
    setSelectedTab(tab);
    void AsyncStorage.setItem(`royallagn:vendor-profile-tab:${vendor.id}`, tab).catch(() => {
      // Persisting the selected tab is an enhancement, not a navigation dependency.
    });
  };
  const favorite = isFavorite(vendor.id);
  const toggleVendorFavorite = (source: FavoriteSourceRef) => toggleFavorite({
    id: vendor.id,
    name: vendor.name,
    category,
    rating: displayedRating.rating,
    reviews: displayedRating.reviews,
    priceLevel: vendor.priceLevel,
    startingPrice: vendor.startingPrice,
    location: vendor.location,
    tags: vendor.tags,
    image: vendor.image,
  }, source);
  const contactVendor = async (channel: Extract<EnquiryChannel, "call" | "whatsapp">, item?: VendorPackage) => {
    if (contactOpening.current) return;
    contactOpening.current = true;
    try {
      await EnquiryService.trackContactAndOpen({
        vendorId: vendor.id,
        vendorName: vendor.name,
        contactPhone: vendor.contactPhone,
        channel,
        source: item ? "package" : "vendor_profile",
        sourceRecordId: item?.id ?? vendor.id,
        packageId: item?.id,
        packageName: item?.title,
      });
    } catch (cause) {
      if (cause instanceof EnquiryExternalOpenError) {
        Alert.alert("Contact app not opened", `${cause.message} Your enquiry click was saved as ${cause.referenceCode}.`);
      } else {
        Alert.alert("Contact unavailable", cause instanceof Error ? cause.message : "Please try again.");
      }
    } finally {
      contactOpening.current = false;
    }
  };
  const requestVendorContact = (channel: Extract<EnquiryChannel, "call" | "whatsapp">, item?: VendorPackage) => {
    if (contactPromptVisible.current || contactOpening.current) return;
    if (authLoading) {
      Alert.alert("Checking sign-in", "Please wait a moment and try again.");
      return;
    }
    if (!isPublicAuthenticated) {
      Alert.alert("Login required", "Please log in before contacting this vendor.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log in", onPress: () => router.push("/Login") },
      ]);
      return;
    }
    contactPromptVisible.current = true;
    const label = channel === "call" ? "Call vendor?" : "Open WhatsApp?";
    const message = channel === "call"
      ? `RoyalLagn will open your phone app to contact ${vendor.name}.`
      : `RoyalLagn will open WhatsApp to contact ${vendor.name}.`;
    Alert.alert(label, message, [
      { text: "Cancel", style: "cancel", onPress: () => { contactPromptVisible.current = false; } },
      { text: channel === "call" ? "Call" : "Continue", onPress: () => { contactPromptVisible.current = false; void contactVendor(channel, item); } },
    ], { cancelable: true, onDismiss: () => { contactPromptVisible.current = false; } });
  };
  const shareProfile = async () => {
    try {
      const result = await shareVendorProfile({ vendorId: vendor.id, vendorName: vendor.name, category, location: vendor.location });
      if (result === "copied") Alert.alert("Profile link copied", "You can paste the RoyalLagn vendor link into WhatsApp, Instagram, email or any other app.");
    } catch (cause) {
      Alert.alert("Unable to share", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  if (desktop) {
    const splitHeroHeight = Math.max(500, Math.min(640, height - 170));

    return (
      <View style={[styles.root, { backgroundColor: background }]}>
        <PublicWebNavbar activeRoute="Categories" />
        <View style={[styles.desktopSplit, { borderColor: sectionDivider }]}>
          <Animated.ScrollView
            style={[styles.desktopPane, styles.desktopMediaPane]}
            contentContainerStyle={styles.desktopMediaContent}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offset = event.nativeEvent.contentOffset.y;
              setProfileScrollOffset((current) => Math.abs(current - offset) >= 64 ? offset : current);
            }}
            scrollEventThrottle={32}
          >
            <DesktopProfileReveal>
              <View
                style={[
                  styles.desktopHeroShell,
                  {
                    height: splitHeroHeight,
                    backgroundColor: dark ? "#05070C" : "#F8EEF2",
                    shadowColor: dark ? "#000000" : "#7B304B",
                  },
                ]}
              >
                <VendorHeroCarousel
                  images={heroImages}
                  fallbackImage={fallbackImage}
                  vendorName={vendor.name}
                  containMedia={!vendor.heroMedia.length}
                  height={splitHeroHeight}
                  onBack={goBack}
                  focalPoints={heroFocalPoints}
                  paused={heroViewerIndex !== null || calendarVisible || packagesVisible || Boolean(enquiryPackage)}
                  onOpen={vendor.heroMedia.length ? setHeroViewerIndex : undefined}
                />
              </View>
            </DesktopProfileReveal>

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} style={styles.desktopTabsWrap}>
              <VendorProfileTabs selected={selectedTab} dark={dark} onChange={selectProfileTab} />
            </ProfileSectionReveal>

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={40}>
              <ProfileTabPanel key={selectedTab}>
                {selectedTab === "portfolio" ? (
                  vendor.portfolioAlbums.length ? (
                    <SectionErrorBoundary label="Portfolio" key={`portfolio-${vendor.id}`}>
                      <PortfolioAlbums
                        albums={vendor.portfolioAlbums}
                        dark={dark}
                        onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id, src: explicitSource } })}
                        onOpenAlbum={(album) => router.push({
                          pathname: "/VendorAlbum",
                          params: { vendorId: vendor.id, albumId: album.id, src: explicitSource },
                        })}
                      />
                    </SectionErrorBoundary>
                  ) : (
                    <View style={[styles.portfolioEmpty, styles.desktopPortfolioEmpty, sectionCardStyle]}>
                      <View style={[styles.portfolioEmptyIcon, { backgroundColor: colors.muted }]}>
                        <Images size={23} color={colors.primaryStrong} />
                      </View>
                      <Text style={[styles.portfolioEmptyTitle, { color: text }]}>Portfolio coming soon</Text>
                      <Text style={[styles.portfolioEmptyText, { color: muted }]}>This vendor has not published any portfolio albums yet. Explore their services or contact them for recent work.</Text>
                    </View>
                  )
                ) : (
                  <SectionErrorBoundary label="Clips" key={`clips-${vendor.id}`}>
                    {publicClipsEnabled === true ? (
                      <VendorClipsGrid
                        clips={vendorClips}
                        loading={clipsLoading}
                        error={clipsError}
                        dark={dark}
                        onOpen={setReelViewerIndex}
                        onRetry={() => setClipsReloadKey((current) => current + 1)}
                      />
                    ) : <VendorClipsComingSoon dark={dark} loading={publicClipsEnabled === null} />}
                  </SectionErrorBoundary>
                )}
              </ProfileTabPanel>
            </ProfileSectionReveal>
          </Animated.ScrollView>

          <Animated.ScrollView
            style={[styles.desktopPane, styles.desktopDetailsPane, { borderColor: sectionDivider }]}
            contentContainerStyle={styles.desktopDetailsContent}
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offset = event.nativeEvent.contentOffset.y;
              setDesktopDetailScrollOffset((current) => Math.abs(current - offset) >= 64 ? offset : current);
            }}
            scrollEventThrottle={32}
          >
            <DesktopProfileReveal>
              <View style={styles.desktopCategoryRow}>
                <Text style={styles.desktopCategory}>{category.toUpperCase()}</Text>
                <View style={[styles.desktopCategoryRule, { backgroundColor: sectionDivider }]} />
              </View>
              <VendorInfoPanel
                name={vendor.name}
                rating={displayedRating.rating}
                reviewCount={displayedRating.reviews}
                location={vendor.location}
                specialties={vendor.tags}
                verified
                topRated={Boolean(vendor.isTopRated)}
                dark={dark}
                favorite={favorite}
                onToggleFavorite={toggleVendorFavorite}
                onShare={() => void shareProfile()}
                membershipPlan={vendor.membershipPlan}
                overlap={false}
              >
                <VendorQuickActions
                  dark={dark}
                  onCall={() => requestVendorContact("call")}
                  onWhatsApp={() => requestVendorContact("whatsapp")}
                  onEnquire={() => router.push("/enquiry")}
                  onCalendar={() => setCalendarVisible(true)}
                />
              </VendorInfoPanel>
            </DesktopProfileReveal>

            <ProfileSectionReveal scrollOffset={desktopDetailScrollOffset} viewportHeight={height} delay={30} style={styles.desktopDetailSection}>
              <PackagesCard
                price={vendor.startingPrice}
                dark={dark}
                subtitle="Compare available pricing or request a custom package"
                onPress={() => setPackagesVisible(true)}
              />
            </ProfileSectionReveal>

            <ProfileSectionReveal scrollOffset={desktopDetailScrollOffset} viewportHeight={height} delay={55} style={[styles.desktopDetailSection, styles.desktopEditorialSection]}>
              <SectionHeading dark={dark}>About</SectionHeading>
              <Text style={[styles.aboutText, { color: muted }]}>{aboutCopy}</Text>
              {about.length > 180 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? "Show less about vendor" : "Read more about vendor"}
                  onPress={() => setExpanded((current) => !current)}
                  style={({ pressed, hovered }) => [
                    styles.readMore,
                    hovered && Platform.OS === "web" && styles.readMoreHover,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.readMoreText}>{expanded ? "Show Less" : "Read More"}</Text>
                  <ChevronRight size={16} color={PINK} style={{ transform: [{ rotate: expanded ? "-90deg" : "0deg" }] }} />
                </Pressable>
              ) : null}
            </ProfileSectionReveal>

            {vendor.services.length ? (
              <ProfileSectionReveal scrollOffset={desktopDetailScrollOffset} viewportHeight={height} delay={75} style={[styles.desktopDetailSection, styles.desktopEditorialSection]}>
                <SectionHeading dark={dark}>Services</SectionHeading>
                <ServiceChips services={vendor.services} dark={dark} />
              </ProfileSectionReveal>
            ) : null}

            <ProfileSectionReveal scrollOffset={desktopDetailScrollOffset} viewportHeight={height} delay={95} style={[styles.desktopDetailSection, styles.desktopEditorialSection]}>
              <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
            </ProfileSectionReveal>
          </Animated.ScrollView>
        </View>

        <FullscreenMediaViewer
          visible={heroViewerIndex !== null}
          media={vendor.heroMedia}
          initialIndex={heroViewerIndex ?? 0}
          title={`${vendor.name} · Hero gallery`}
          onClose={() => setHeroViewerIndex(null)}
        />
        <PackageDetailsModal
          visible={packagesVisible}
          vendorId={vendor.id}
          vendorName={vendor.name}
          contactPhone={vendor.contactPhone}
          dark={dark}
          onClose={() => setPackagesVisible(false)}
          onCall={(item) => requestVendorContact("call", item)}
          onWhatsApp={(item) => requestVendorContact("whatsapp", item)}
          onEnquire={(item) => {
            setPackagesVisible(false);
            setEnquiryPackage(item);
          }}
        />
        <PackageEnquiryModal
          visible={Boolean(enquiryPackage)}
          vendorId={vendor.id}
          vendorName={vendor.name}
          item={enquiryPackage}
          dark={dark}
          onClose={() => setEnquiryPackage(null)}
          onSignInRequired={() => router.push("/DashboardCenter")}
          onSent={() => setEnquiryPackage(null)}
        />
        <VendorAvailabilityModal
          visible={calendarVisible}
          vendorId={vendor.id}
          vendorName={vendor.name}
          availability={vendor.availability}
          dark={dark}
          onClose={() => setCalendarVisible(false)}
        />
        {publicClipsEnabled === true ? <VendorClipsReelViewer
          visible={reelViewerIndex !== null}
          clips={vendorClips}
          initialIndex={reelViewerIndex ?? 0}
          vendorName={vendor.name}
          verified
          onClose={() => setReelViewerIndex(null)}
        /> : null}
      </View>
    );
  }

  if (wideProfile) {
    const widePageWidth = Math.min(width - (desktop ? 64 : 40), 1280);
    const wideHeroHeight = desktop
      ? Math.max(460, Math.min(540, height - 220))
      : Math.max(380, Math.min(460, height * 0.48));

    return (
      <View style={[styles.root, { backgroundColor: background }]}>
        <PublicWebNavbar activeRoute="Categories" />
        <Animated.ScrollView
          style={styles.wideScroll}
          contentContainerStyle={[styles.wideScrollContent, { paddingBottom: desktop ? 48 : mobileTabBarHeight + 28 }]}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            const offset = event.nativeEvent.contentOffset.y;
            setProfileScrollOffset((current) => Math.abs(current - offset) >= 96 ? offset : current);
          }}
          scrollEventThrottle={32}
        >
          <View style={[styles.widePage, { width: widePageWidth }]}>
            <DesktopProfileReveal style={[styles.wideStage, !desktop && styles.wideStageTablet]}>
              <View
                style={[
                  styles.wideHeroShell,
                  !desktop && styles.wideHeroShellTablet,
                  {
                    height: wideHeroHeight,
                    backgroundColor: dark ? "#05070C" : "#F8EEF2",
                    shadowColor: dark ? "#000000" : "#7B304B",
                  },
                ]}
              >
                <VendorHeroCarousel
                  images={heroImages}
                  fallbackImage={fallbackImage}
                  vendorName={vendor.name}
                  containMedia={!vendor.heroMedia.length}
                  height={wideHeroHeight}
                  onBack={goBack}
                  focalPoints={heroFocalPoints}
                  paused={heroViewerIndex !== null || calendarVisible || packagesVisible || Boolean(enquiryPackage)}
                  onOpen={vendor.heroMedia.length ? setHeroViewerIndex : undefined}
                />
              </View>

              <View style={[styles.wideDetailsRail, !desktop && styles.wideDetailsRailTablet]}>
                <View
                  style={[
                    styles.wideIdentityCard,
                    {
                      backgroundColor: surface,
                      borderColor: sectionDivider,
                      shadowColor: dark ? "#000000" : "#7B304B",
                    },
                  ]}
                >
                  <VendorInfoPanel
                    name={vendor.name}
                    rating={displayedRating.rating}
                    reviewCount={displayedRating.reviews}
                    location={vendor.location}
                    specialties={[category, ...vendor.tags]}
                    verified
                    topRated={Boolean(vendor.isTopRated)}
                    dark={dark}
                    favorite={favorite}
                    onToggleFavorite={toggleVendorFavorite}
                    onShare={() => void shareProfile()}
                    membershipPlan={vendor.membershipPlan}
                    overlap={false}
                  >
                    <VendorQuickActions
                      dark={dark}
                      onCall={() => requestVendorContact("call")}
                      onWhatsApp={() => requestVendorContact("whatsapp")}
                      onEnquire={() => router.push("/enquiry")}
                      onCalendar={() => setCalendarVisible(true)}
                    />
                  </VendorInfoPanel>
                </View>

                <PackagesCard
                  price={vendor.startingPrice}
                  dark={dark}
                  subtitle="Compare available pricing or request a custom package"
                  onPress={() => setPackagesVisible(true)}
                />
              </View>
            </DesktopProfileReveal>

            <View style={[styles.wideContentGrid, !splitDesktopContent && styles.wideContentGridTablet]}>
              <View style={styles.widePrimaryColumn}>
                <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height}>
                  <VendorProfileTabs
                    selected={selectedTab}
                    dark={dark}
                    onChange={selectProfileTab}
                  />
                </ProfileSectionReveal>

                <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={40}>
                <ProfileTabPanel key={selectedTab}>
                  {selectedTab === "portfolio" ? (
                    vendor.portfolioAlbums.length ? (
                      <View style={styles.widePortfolioSection}>
                        <SectionErrorBoundary label="Portfolio" key={`portfolio-${vendor.id}`}>
                          <PortfolioAlbums
                            albums={vendor.portfolioAlbums}
                            dark={dark}
                            onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id, src: explicitSource } })}
                            onOpenAlbum={(album) => router.push({
                              pathname: "/VendorAlbum",
                              params: { vendorId: vendor.id, albumId: album.id, src: explicitSource },
                            })}
                          />
                        </SectionErrorBoundary>
                      </View>
                    ) : (
                      <View style={[styles.portfolioEmpty, styles.widePortfolioEmpty, sectionCardStyle]}>
                        <View style={[styles.portfolioEmptyIcon, { backgroundColor: colors.muted }]}>
                          <Images size={23} color={colors.primaryStrong} />
                        </View>
                        <Text style={[styles.portfolioEmptyTitle, { color: text }]}>Portfolio coming soon</Text>
                        <Text style={[styles.portfolioEmptyText, { color: muted }]}>This vendor has not published any portfolio albums yet. Explore their services or contact them for recent work.</Text>
                      </View>
                    )
                  ) : (
                    <SectionErrorBoundary label="Clips" key={`clips-${vendor.id}`}>
                      {publicClipsEnabled === true ? (
                        <VendorClipsGrid
                          clips={vendorClips}
                          loading={clipsLoading}
                          error={clipsError}
                          dark={dark}
                          onOpen={setReelViewerIndex}
                          onRetry={() => setClipsReloadKey((current) => current + 1)}
                        />
                      ) : <VendorClipsComingSoon dark={dark} loading={publicClipsEnabled === null} />}
                    </SectionErrorBoundary>
                  )}
                </ProfileTabPanel>
                </ProfileSectionReveal>

              </View>

              <View style={[styles.wideSecondaryColumn, !splitDesktopContent && styles.wideSecondaryColumnTablet]}>
                <View style={[styles.sectionCard, styles.wideSectionCard, !splitDesktopContent && styles.wideSectionCardTablet, sectionCardStyle]}>
                  <SectionHeading dark={dark}>About</SectionHeading>
                  <Text style={[styles.aboutText, { color: muted }]}>{aboutCopy}</Text>
                  {about.length > 180 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={expanded ? "Show less about vendor" : "Read more about vendor"}
                      onPress={() => setExpanded((current) => !current)}
                      style={({ pressed, hovered }) => [
                        styles.readMore,
                        hovered && Platform.OS === "web" && styles.readMoreHover,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.readMoreText}>{expanded ? "Show Less" : "Read More"}</Text>
                      <ChevronRight
                        size={16}
                        color={PINK}
                        style={{ transform: [{ rotate: expanded ? "-90deg" : "0deg" }] }}
                      />
                    </Pressable>
                  ) : null}
                </View>

                {vendor.services.length ? (
                  <View style={[styles.sectionCard, styles.wideSectionCard, !splitDesktopContent && styles.wideSectionCardTablet, sectionCardStyle]}>
                    <SectionHeading dark={dark}>Services</SectionHeading>
                    <ServiceChips services={vendor.services} dark={dark} />
                  </View>
                ) : null}
              </View>
            </View>

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={80} style={[styles.sectionCard, styles.wideSectionCard, styles.wideReviewsSection, sectionCardStyle]}>
              <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
            </ProfileSectionReveal>
          </View>
        </Animated.ScrollView>

        {!desktop ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}
        <FullscreenMediaViewer
          visible={heroViewerIndex !== null}
          media={vendor.heroMedia}
          initialIndex={heroViewerIndex ?? 0}
          title={`${vendor.name} · Hero gallery`}
          onClose={() => setHeroViewerIndex(null)}
        />
        <PackageDetailsModal
          visible={packagesVisible}
          vendorId={vendor.id}
          vendorName={vendor.name}
          contactPhone={vendor.contactPhone}
          dark={dark}
          onClose={() => setPackagesVisible(false)}
          onCall={(item) => requestVendorContact("call", item)}
          onWhatsApp={(item) => requestVendorContact("whatsapp", item)}
          onEnquire={(item) => {
            setPackagesVisible(false);
            setEnquiryPackage(item);
          }}
        />
        <PackageEnquiryModal
          visible={Boolean(enquiryPackage)}
          vendorId={vendor.id}
          vendorName={vendor.name}
          item={enquiryPackage}
          dark={dark}
          onClose={() => setEnquiryPackage(null)}
          onSignInRequired={() => router.push("/DashboardCenter")}
          onSent={() => setEnquiryPackage(null)}
        />
        <VendorAvailabilityModal
          visible={calendarVisible}
          vendorId={vendor.id}
          vendorName={vendor.name}
          availability={vendor.availability}
          dark={dark}
          onClose={() => setCalendarVisible(false)}
        />
        {publicClipsEnabled === true ? <VendorClipsReelViewer
          visible={reelViewerIndex !== null}
          clips={vendorClips}
          initialIndex={reelViewerIndex ?? 0}
          vendorName={vendor.name}
          verified
          onClose={() => setReelViewerIndex(null)}
        /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <PublicWebNavbar activeRoute="Categories" />
      <PinnedHeroProfileLayout
        heroHeight={heroHeight}
        pageWidth={contentWidth}
        overlap={24}
        backgroundColor={background}
        sheetColor={background}
        contentContainerStyle={{ paddingBottom: desktop ? 28 : mobileTabBarHeight }}
        onScrollPosition={setProfileScrollOffset}
        hero={(
          <VendorHeroCarousel
            images={heroImages}
            fallbackImage={fallbackImage}
            vendorName={vendor.name}
            containMedia={!vendor.heroMedia.length}
            height={heroHeight}
            onBack={goBack}
            focalPoints={heroFocalPoints}
            paused={heroViewerIndex !== null || calendarVisible || packagesVisible || Boolean(enquiryPackage)}
            onOpen={vendor.heroMedia.length ? setHeroViewerIndex : undefined}
          />
        )}
      >
          <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height}>
          <View style={[styles.mobileCategoryRow, { paddingHorizontal: width < 440 ? 18 : 20 }]}>
            <Text style={styles.desktopCategory}>{category.toUpperCase()}</Text>
            <View style={[styles.desktopCategoryRule, { backgroundColor: sectionDivider }]} />
          </View>
          <VendorInfoPanel
            name={vendor.name}
            rating={displayedRating.rating}
            reviewCount={displayedRating.reviews}
            location={vendor.location}
            specialties={vendor.tags}
            verified
            topRated={Boolean(vendor.isTopRated)}
            dark={dark}
            favorite={favorite}
            onToggleFavorite={toggleVendorFavorite}
            onShare={() => void shareProfile()}
            membershipPlan={vendor.membershipPlan}
            overlap={false}
          >
            <VendorQuickActions
              dark={dark}
              onCall={() => requestVendorContact("call")}
              onWhatsApp={() => requestVendorContact("whatsapp")}
              onEnquire={() => router.push("/enquiry")}
              onCalendar={() => setCalendarVisible(true)}
            />
          </VendorInfoPanel>
          </ProfileSectionReveal>

          <View style={[styles.content, width < 600 && styles.contentCompact]}>
            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height}>
            <PackagesCard
              price={vendor.startingPrice}
              dark={dark}
              subtitle="Compare available pricing or request a custom package"
              onPress={() => setPackagesVisible(true)}
            />
            </ProfileSectionReveal>

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={30}>
            <VendorProfileTabs
              selected={selectedTab}
              dark={dark}
              onChange={selectProfileTab}
            />
            </ProfileSectionReveal>

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={55}>
            <ProfileTabPanel key={selectedTab}>
            {selectedTab === "portfolio" ? (
              vendor.portfolioAlbums.length ? <View style={styles.portfolioSection}>
                <SectionErrorBoundary label="Portfolio" key={`portfolio-${vendor.id}`}>
                  <PortfolioAlbums
                    albums={vendor.portfolioAlbums}
                    dark={dark}
                    onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id, src: explicitSource } })}
                    onOpenAlbum={(album) => router.push({
                      pathname: "/VendorAlbum",
                      params: { vendorId: vendor.id, albumId: album.id, src: explicitSource },
                    })}
                  />
                </SectionErrorBoundary>
              </View> : (
                <View style={[styles.portfolioEmpty, sectionCardStyle]}>
                  <View style={[styles.portfolioEmptyIcon, { backgroundColor: colors.muted }]}>
                    <Images size={23} color={colors.primaryStrong} />
                  </View>
                  <Text style={[styles.portfolioEmptyTitle, { color: text }]}>Portfolio coming soon</Text>
                  <Text style={[styles.portfolioEmptyText, { color: muted }]}>This vendor has not published any portfolio albums yet. Explore their services or contact them for recent work.</Text>
                </View>
              )
            ) : (
              <SectionErrorBoundary label="Clips" key={`clips-${vendor.id}`}>
                {publicClipsEnabled === true ? (
                  <VendorClipsGrid
                    clips={vendorClips}
                    loading={clipsLoading}
                    error={clipsError}
                    dark={dark}
                    onOpen={setReelViewerIndex}
                    onRetry={() => setClipsReloadKey((current) => current + 1)}
                  />
                ) : <VendorClipsComingSoon dark={dark} loading={publicClipsEnabled === null} />}
              </SectionErrorBoundary>
            )}
            </ProfileTabPanel>
            </ProfileSectionReveal>

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={70} style={[styles.sectionCard, sectionCardStyle]}>
              <SectionHeading dark={dark}>About</SectionHeading>
              <Text style={[styles.aboutText, { color: muted }]}>{aboutCopy}</Text>
              {about.length > 180 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? "Show less about vendor" : "Read more about vendor"}
                  onPress={() => setExpanded((current) => !current)}
                  style={({ pressed, hovered }) => [
                    styles.readMore,
                    hovered && Platform.OS === "web" && styles.readMoreHover,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.readMoreText}>{expanded ? "Show Less" : "Read More"}</Text>
                  <ChevronRight
                    size={16}
                    color={PINK}
                    style={{ transform: [{ rotate: expanded ? "-90deg" : "0deg" }] }}
                  />
                </Pressable>
              ) : null}
            </ProfileSectionReveal>

            {vendor.services.length ? (
              <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={90} style={[styles.sectionCard, sectionCardStyle]}>
                <SectionHeading dark={dark}>Services</SectionHeading>
                <ServiceChips services={vendor.services} dark={dark} />
              </ProfileSectionReveal>
            ) : null}

            <ProfileSectionReveal scrollOffset={profileScrollOffset} viewportHeight={height} delay={110} style={[styles.sectionCard, styles.reviewsSection, sectionCardStyle]}>
              <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
            </ProfileSectionReveal>
          </View>
      </PinnedHeroProfileLayout>

      {!desktop ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}
      <FullscreenMediaViewer
        visible={heroViewerIndex !== null}
        media={vendor.heroMedia}
        initialIndex={heroViewerIndex ?? 0}
        title={`${vendor.name} · Hero gallery`}
        onClose={() => setHeroViewerIndex(null)}
      />
      <PackageDetailsModal
        visible={packagesVisible}
        vendorId={vendor.id}
        vendorName={vendor.name}
        contactPhone={vendor.contactPhone}
        dark={dark}
        onClose={() => setPackagesVisible(false)}
        onCall={(item) => requestVendorContact("call", item)}
        onWhatsApp={(item) => requestVendorContact("whatsapp", item)}
        onEnquire={(item) => {
          setPackagesVisible(false);
          setEnquiryPackage(item);
        }}
      />
      <PackageEnquiryModal
        visible={Boolean(enquiryPackage)}
        vendorId={vendor.id}
        vendorName={vendor.name}
        item={enquiryPackage}
        dark={dark}
        onClose={() => setEnquiryPackage(null)}
        onSignInRequired={() => router.push("/DashboardCenter")}
        onSent={() => setEnquiryPackage(null)}
      />
      <VendorAvailabilityModal
        visible={calendarVisible}
        vendorId={vendor.id}
        vendorName={vendor.name}
        availability={vendor.availability}
        dark={dark}
        onClose={() => setCalendarVisible(false)}
      />
      {publicClipsEnabled === true ? <VendorClipsReelViewer
        visible={reelViewerIndex !== null}
        clips={vendorClips}
        initialIndex={reelViewerIndex ?? 0}
        vendorName={vendor.name}
        verified
        onClose={() => setReelViewerIndex(null)}
      /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  desktopSplit: {
    width: "100%",
    maxWidth: 1480,
    flex: 1,
    alignSelf: "center",
    flexDirection: "row",
    overflow: "hidden",
  },
  desktopPane: { flex: 1 },
  desktopMediaPane: { flexBasis: "58%" },
  desktopDetailsPane: { flexBasis: "42%", borderLeftWidth: StyleSheet.hairlineWidth },
  desktopMediaContent: { paddingHorizontal: 32, paddingTop: 32, paddingBottom: 64 },
  desktopDetailsContent: { paddingHorizontal: 40, paddingTop: 34, paddingBottom: 64 },
  desktopHeroShell: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  desktopTabsWrap: { marginTop: 22 },
  desktopPortfolioEmpty: { minHeight: 280, marginTop: 18 },
  desktopCategoryRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  desktopCategory: {
    color: PINK,
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.metadata,
    lineHeight: typeLeading.metadata,
    letterSpacing: 0.45,
  },
  desktopCategoryRule: { flex: 1, height: StyleSheet.hairlineWidth },
  mobileCategoryRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 20, marginBottom: -2 },
  desktopDetailSection: { marginTop: 24 },
  desktopEditorialSection: { paddingTop: 26, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F2DDE5" },
  wideScroll: { flex: 1 },
  wideScrollContent: { width: "100%", alignItems: "center" },
  widePage: { maxWidth: "100%", alignSelf: "center", paddingTop: 24 },
  wideStage: { width: "100%", flexDirection: "row", alignItems: "stretch", gap: 22 },
  wideStageTablet: { flexDirection: "column", gap: 18 },
  wideHeroShell: {
    flex: 1.55,
    minWidth: 0,
    borderRadius: 24,
    overflow: "hidden",
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  wideHeroShellTablet: { width: "100%", flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  wideDetailsRail: { width: 392, flexShrink: 0, gap: 16 },
  wideDetailsRailTablet: { width: "100%" },
  wideIdentityCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 22,
    overflow: "hidden",
    shadowOpacity: 0.055,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  wideContentGrid: { width: "100%", marginTop: 24, flexDirection: "row", alignItems: "flex-start", gap: 24 },
  wideContentGridTablet: { flexDirection: "column" },
  widePrimaryColumn: { flex: 1, minWidth: 0 },
  wideSecondaryColumn: { width: 360, flexShrink: 0, gap: 16 },
  wideSecondaryColumnTablet: { width: "100%", flexDirection: "row", alignItems: "flex-start" },
  wideSectionCardTablet: { flex: 1 },
  widePortfolioSection: { marginTop: 4 },
  widePortfolioEmpty: { minHeight: 280, marginTop: 16 },
  wideSectionCard: { marginTop: 0, padding: 22 },
  wideReviewsSection: { marginTop: 22, marginBottom: 0 },
  content: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18 },
  contentCompact: { paddingHorizontal: 14, paddingTop: 14 },
  sectionCard: {
    marginTop: 14,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: "#6F3048",
    shadowOpacity: 0,
    elevation: 0,
  },
  portfolioSection: { marginTop: 2 },
  portfolioEmpty: { minHeight: 210, marginTop: 14, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", padding: 24 },
  portfolioEmptyIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  portfolioEmptyTitle: { marginTop: 13, fontFamily: fonts.serif.bold, fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  portfolioEmptyText: { maxWidth: 430, marginTop: 6, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  reviewsSection: { marginBottom: 16 },
  sectionHeadingWrap: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  sectionHeading: {
    fontFamily: fonts.serif.bold,
    fontSize: typeScale.editorialCardTitle,
    lineHeight: typeLeading.editorialCardTitle,
    letterSpacing: -0.15,
  },
  sectionHeadingRule: { flex: 1, height: StyleSheet.hairlineWidth },
  aboutText: { maxWidth: 900, fontFamily: fonts.sans.regular, fontSize: typeScale.body, lineHeight: typeLeading.body },
  readMore: {
    minHeight: 38,
    alignSelf: "flex-end",
    marginTop: 4,
    paddingLeft: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readMoreHover: { transform: [{ translateX: 2 }] },
  readMoreText: { color: PINK, fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  pressed: { opacity: 0.7 },
  loadingWrap: { flex: 1, width: "100%", maxWidth: 1120, alignSelf: "center" },
  loadingContent: { width: "100%", maxWidth: 980, alignSelf: "center", gap: 14, padding: 20 },
  notFound: { width: "90%", maxWidth: 520, minHeight: 300, alignSelf: "center", marginVertical: "auto", borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", padding: 28 },
  notFoundIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  notFoundTitle: { fontFamily: fonts.serif.bold, fontSize: typeScale.metric, lineHeight: typeLeading.metric, textAlign: "center" },
  loadError: { maxWidth: 420, marginTop: 8, textAlign: "center", fontFamily: fonts.sans.regular, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact },
  recoveryActions: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  retry: { minHeight: 44, borderRadius: 14, paddingHorizontal: 20, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  retryHovered: { backgroundColor: "#BE185D", transform: [{ translateY: -1 }] },
  retryText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  goBack: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  goBackText: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
});
