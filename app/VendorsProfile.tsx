import React, { useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, useWindowDimensions, View, } from "react-native";
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
import VendorClipsReelViewer from "@/components/vendor-profile/VendorClipsReelViewer";
import VendorProfileTabs, {
  type VendorProfileTab, } from "@/components/vendor-profile/VendorProfileTabs";
import { StandaloneMobileTabBar, useMobileTabBarHeight } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import {
  getApprovedPublicVendorById, recordPublicVendorProfileView, subscribeToPublicVendorChanges, type PublicVendorListing, } from "@/services/publicVendorListings";
import { portfolioMediaUrl } from "@/services/vendorPortfolio";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import type { VendorPackage } from "@/services/vendorPackages";
import { EnquiryExternalOpenError, EnquiryService, type EnquiryChannel } from "@/services/enquiries";
import { shareVendorProfile } from "@/services/vendorShare";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { SkeletonBone, SkeletonList } from "@/components/loading/Skeleton";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

const PINK = "#E91E63";

function enhanceImage(uri: string) {
  return uri.replace(/([?&])w=\d+/, "$1w=1200");
}

function SectionHeading({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <View style={styles.sectionHeadingWrap}>
      <Text style={[styles.sectionHeading, { color: dark ? "#F8F1F4" : "#261A20" }]}>{children}</Text>
      <View style={styles.ornament}>
        <View style={styles.ornamentLine} />
        <View style={styles.ornamentDot} />
        <View style={styles.ornamentLine} />
      </View>
    </View>
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
  const params = useLocalSearchParams<{ vendorId?: string; category?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const paramCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [vendorReloadKey, setVendorReloadKey] = useState(0);
  const category = vendor?.category ?? paramCategory ?? "Photographers";
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
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
  }, [vendor?.id]);

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
    if (!vendor?.id) return;
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
  }, [clipsReloadKey, vendor?.id]);

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
    }
  };
  const shareProfile = async () => {
    try {
      const result = await shareVendorProfile({ vendorId: vendor.id, vendorName: vendor.name, category, location: vendor.location });
      if (result === "copied") Alert.alert("Profile link copied", "You can paste the RoyalLagn vendor link into WhatsApp, Instagram, email or any other app.");
    } catch (cause) {
      Alert.alert("Unable to share", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

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
              onCall={() => void contactVendor("call")}
              onWhatsApp={() => void contactVendor("whatsapp")}
              onEnquire={() => router.push("/enquiry")}
              onCalendar={() => setCalendarVisible(true)}
            />
          </VendorInfoPanel>

          <View style={[styles.content, width < 600 && styles.contentCompact]}>
            <PackagesCard
              price={vendor.startingPrice}
              dark={dark}
              subtitle="Compare available pricing or request a custom package"
              onPress={() => setPackagesVisible(true)}
            />

            <VendorProfileTabs
              selected={selectedTab}
              dark={dark}
              onChange={selectProfileTab}
            />

            {selectedTab === "portfolio" ? (
              vendor.portfolioAlbums.length ? <View style={styles.portfolioSection}>
                <SectionErrorBoundary label="Portfolio" key={`portfolio-${vendor.id}`}>
                  <PortfolioAlbums
                    albums={vendor.portfolioAlbums}
                    dark={dark}
                    onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id } })}
                    onOpenAlbum={(album) => router.push({
                      pathname: "/VendorAlbum",
                      params: { vendorId: vendor.id, albumId: album.id },
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
                <VendorClipsGrid
                  clips={vendorClips}
                  loading={clipsLoading}
                  error={clipsError}
                  dark={dark}
                  onOpen={setReelViewerIndex}
                  onRetry={() => setClipsReloadKey((current) => current + 1)}
                />
              </SectionErrorBoundary>
            )}

            <View style={[styles.sectionCard, sectionCardStyle]}>
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
              <View style={[styles.sectionCard, sectionCardStyle]}>
                <SectionHeading dark={dark}>Services</SectionHeading>
                <ServiceChips services={vendor.services} dark={dark} />
              </View>
            ) : null}

            <View style={[styles.sectionCard, styles.reviewsSection, sectionCardStyle]}>
              <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
            </View>
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
        onCall={(item) => void contactVendor("call", item)}
        onWhatsApp={(item) => void contactVendor("whatsapp", item)}
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
      <VendorClipsReelViewer
        visible={reelViewerIndex !== null}
        clips={vendorClips}
        initialIndex={reelViewerIndex ?? 0}
        vendorName={vendor.name}
        verified
        onClose={() => setReelViewerIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18 },
  contentCompact: { paddingHorizontal: 14, paddingTop: 14 },
  sectionCard: {
    marginTop: 14,
    padding: 16,
    borderWidth: 1,
    borderRadius: 20,
    shadowColor: "#6F3048",
    shadowOpacity: 0,
    elevation: 0,
  },
  portfolioSection: { marginTop: 2 },
  portfolioEmpty: { minHeight: 210, marginTop: 14, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 24 },
  portfolioEmptyIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  portfolioEmptyTitle: { marginTop: 13, fontFamily: fonts.serif.bold, fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  portfolioEmptyText: { maxWidth: 430, marginTop: 6, fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center" },
  reviewsSection: { marginBottom: 16 },
  sectionHeadingWrap: { alignSelf: "flex-start", marginBottom: 10 },
  sectionHeading: {
    fontFamily: fonts.serif.bold,
    fontSize: typeScale.editorialCardTitle,
    lineHeight: typeLeading.editorialCardTitle,
    letterSpacing: -0.15,
  },
  ornament: { width: 64, height: 7, flexDirection: "row", alignItems: "center", gap: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#FACC15" },
  ornamentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#FACC15" },
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
  notFound: { width: "90%", maxWidth: 520, minHeight: 300, alignSelf: "center", marginVertical: "auto", borderWidth: 1, borderRadius: 24, alignItems: "center", justifyContent: "center", padding: 28 },
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
