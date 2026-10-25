import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, } from "react-native";
// NativeWind's native Pressable interop doesn't resolve a function
// `style={(state) => [...]}` prop on Android (whole style silently drops).
// InteropSafePressable resolves it first. See VendorCalendar.tsx /
// AppDialogProvider.tsx for the same fix.
import Pressable from "@/components/InteropSafePressable";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { Briefcase, ChevronRight, Send, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useFavorites } from "@/context/FavoritesContext";
import PageLoader from "@/components/loading/PageLoader";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import { StandaloneMobileTabBar, useMobileTabBarHeight } from "@/components/MobileTabBar";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import PackagesCard from "@/components/vendor-profile/PackagesCard";
import VendorDirectBookingSection from "@/components/vendor-profile/VendorDirectBookingSection";
import { useVendorPackages } from "@/hooks/useVendorPackages";
import type { BookingAddOn } from "@/services/vendorBookings";
import PackageDetailsModal from "@/components/packages/PackageDetailsModal";
import BookingCheckoutModal from "@/components/booking/BookingCheckoutModal";
import FullscreenMediaViewer from "@/components/vendor-profile/FullscreenMediaViewer";
import PortfolioAlbumModal from "@/components/vendor-profile/PortfolioAlbumModal";
import PortfolioAlbums from "@/components/vendor-profile/PortfolioAlbums";
import ServiceChips from "@/components/vendor-profile/ServiceChips";
import VendorHeroCarousel from "@/components/vendor-profile/VendorHeroCarousel";
import PinnedHeroProfileLayout from "@/components/vendor-profile/PinnedHeroProfileLayout";
import VendorInfoPanel from "@/components/vendor-profile/VendorInfoPanel";
import VendorAvailabilityModal from "@/components/vendor-profile/VendorAvailabilityModal";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import AwardsSection from "@/components/vendor-profile/AwardsSection";
import LanguagesSection from "@/components/vendor-profile/LanguagesSection";
import BusinessHoursSection from "@/components/vendor-profile/BusinessHoursSection";
import FaqSection from "@/components/vendor-profile/FaqSection";
import DownloadAppPopup from "@/components/vendor-profile/DownloadAppPopup";
import CustomerEnquiryModal from "@/components/vendor-profile/CustomerEnquiryModal";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { recordPublicVendorProfileView } from "@/services/publicVendorListings";
import { portfolioMediaUrl, type PublicPortfolioAlbum } from "@/services/vendorPortfolio";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";
import type { VendorPackage } from "@/services/vendorPackages";
import { EnquiryExternalOpenError, EnquiryService, type EnquiryChannel } from "@/services/enquiries";
import { shareVendorProfile } from "@/services/vendorShare";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import {
  getVendorPublicProfileBySlug,
  recordVendorProfileEvent,
  recordVendorTrafficView,
} from "@/services/vendorPublicProfile";
import { resolveTrafficSource } from "@/services/trafficSource";
import type { PublicVendorListing } from "@/services/publicVendorListings";
import { brandPalette } from "@/constants/brandPalette";
import { vendorProfileHref } from "@/services/contactActions";
import { applyWebDocumentMeta } from "@/lib/seo/documentMeta";
import { INDEXABLE_ROBOTS, canonicalUrl } from "@/lib/seo/publicSeo";
import { isNativeTabletDevice, isNativeTabletWindow, isPublicWideLayout } from "@/utils/responsiveLayout";

const PINK = brandPalette.light.primary;

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

type LoadState = "loading" | "found" | "not_found";

export default function VendorPublicProfileScreen() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const dark = colorScheme === "dark";
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const tabletDevice = isNativeTabletDevice(width, height);
  const tabletProfile = isNativeTabletWindow(width, height);
  const tabletPortrait = tabletDevice && !tabletProfile;
  const desktop = isPublicWideLayout(width, height);
  const mobileTabBarHeight = useMobileTabBarHeight();
  const params = useLocalSearchParams<{ slug?: string; src?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const explicitSource = Array.isArray(params.src) ? params.src[0] : params.src;

  const [state, setState] = useState<LoadState>("loading");
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const category = vendor?.category ?? "";
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const { isPublicAuthenticated, loading: authLoading, profile } = usePublicAuth();
  const [expanded, setExpanded] = useState(false);
  const [heroViewerIndex, setHeroViewerIndex] = useState<number | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<PublicPortfolioAlbum | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [packagesVisible, setPackagesVisible] = useState(false);
  const [bookingPackage, setBookingPackage] = useState<VendorPackage | null>(null);
  const { packages: vendorPackages, loading: loadingPackages } = useVendorPackages(vendor?.id, true);
  const [bookingCheckoutOpen, setBookingCheckoutOpen] = useState(false);
  const [bookingData, setBookingData] = useState<{
    selectedPackages: VendorPackage[];
    selectedAddOns: Record<string, BookingAddOn>;
    startDate: string;
    endDate: string;
    totalDays: number;
    financials: {
      totalAmount: number;
      advanceAmount: number;
      dueAmount: number;
    };
  } | null>(null);
  const [enquiryPackage, setEnquiryPackage] = useState<VendorPackage | null>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const contactPromptVisible = useRef(false);
  const contactOpening = useRef(false);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setState("loading");
    getVendorPublicProfileBySlug(slug)
      .then((result) => {
        if (!active) return;
        if (result.kind === "found") {
          setVendor(result.vendor);
          setState("found");
        } else if (result.kind === "redirect") {
          router.replace(vendorProfileHref(result.slug, explicitSource) as never);
        } else {
          setState("not_found");
        }
      })
      .catch(() => {
        if (active) setState("not_found");
      });
    return () => {
      active = false;
    };
  }, [explicitSource, slug, router]);

  useEffect(() => {
    if (!vendor?.id) return;
    void recordPublicVendorProfileView(vendor.id).catch(() => {
      // Profile viewing must never block the public vendor page.
    });
    const source = resolveTrafficSource(explicitSource);
    void recordVendorTrafficView(vendor.id, source).catch(() => {
      // Analytics must never block the public vendor page.
    });
  }, [explicitSource, vendor?.id]);





  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !vendor) return;
    const path = slug ? `/vendor/${encodeURIComponent(slug)}` : "/";
    const url = canonicalUrl(path);
    const description = vendor.description?.trim()
      || `${vendor.name} on RoyalLagn — ${vendor.category} in ${vendor.location}.`;
    const image = vendor.heroMedia.length ? portfolioMediaUrl(vendor.heroMedia[0], "hero") : vendor.image;
    applyWebDocumentMeta({
      path,
      description,
      ogTitle: vendor.name,
      robots: INDEXABLE_ROBOTS,
      ogType: "business.business",
      ogImage: image || undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": `${url}#business`,
        name: vendor.name,
        image: image ? [image] : undefined,
        description,
        url,
        address: vendor.location || vendor.address ? {
          "@type": "PostalAddress",
          streetAddress: vendor.address || undefined,
          addressLocality: vendor.location?.split(",")[0]?.trim() || undefined,
          addressCountry: "IN",
        } : undefined,
        areaServed: vendor.location || undefined,
        priceRange: vendor.startingPrice || undefined,
        telephone: vendor.contactPhone || undefined,
        ...(vendor.reviews
          ? { aggregateRating: { "@type": "AggregateRating", ratingValue: vendor.rating, reviewCount: vendor.reviews } }
          : {}),
      },
    });
  }, [slug, vendor]);

  const background = dark ? "#070B14" : "#FFFFFF";
  const surface = dark ? "#0E141F" : "rgba(255, 253, 254, 0.96)";
  const text = dark ? "#FFF8FB" : "#1D1519";
  const muted = dark ? "#C6BAC0" : "#62575D";
  const sectionDivider = dark ? "#303846" : "rgba(190, 123, 103, 0.20)";
  const contentWidth = Math.min(width, 1120);
  const heroHeight = useMemo(() => {
    const usableHeight = Math.max(520, height - insets.top - insets.bottom);
    return desktop
      ? Math.max(420, Math.min(520, usableHeight * 0.5))
      : tabletPortrait
        ? Math.max(400, Math.min(460, usableHeight * 0.42))
      : Math.max(340, Math.min(500, width * 1.18, usableHeight * 0.52));
  }, [desktop, height, insets.bottom, insets.top, tabletPortrait, width]);
  const sectionCardStyle = { backgroundColor: surface, borderColor: sectionDivider };

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

  if (state === "loading") {
    return (
      <View style={[styles.root, { backgroundColor: background }]}>
        <PageLoader />
        {!desktop ? <StandaloneMobileTabBar activeRoute={null} /> : null}
      </View>
    );
  }

  if (state === "not_found" || !vendor) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: background, paddingTop: insets.top }]}>
        <Text style={[styles.notFoundTitle, { color: text }]}>Vendor not found</Text>
        <Text style={[styles.loadError, { color: muted }]}>
          This profile doesn&apos;t exist or is no longer available.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.goBack}>
          <Text style={styles.goBackText}>Go to RoyalLagn</Text>
        </Pressable>
        {!desktop ? <StandaloneMobileTabBar activeRoute={null} /> : null}
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
  const favorite = isFavorite(vendor.id);
  const toggleVendorFavorite = (source: FavoriteSourceRef) => toggleFavorite({
    id: vendor.id,
    slug: vendor.slug,
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
    void recordVendorProfileEvent(vendor.id, channel === "call" ? "call_click" : "whatsapp_click").catch(() => {});
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
    if (authLoading) {
      Alert.alert("Checking sign-in", "Please wait a moment and try again.");
      return;
    }
    if (!isPublicAuthenticated) {
      Alert.alert("Login required", "Please log in or create an account before sharing this vendor.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log in", onPress: () => router.push("/Login") },
      ]);
      return;
    }
    void recordVendorProfileEvent(vendor.id, "link_share", "share").catch(() => {});
    try {
      const result = await shareVendorProfile({
        vendorId: vendor.id,
        vendorName: vendor.name,
        category,
        location: vendor.location,
        slug: vendor.slug,
      });
      if (result === "copied") Alert.alert("Profile link copied", "You can paste the RoyalLagn vendor link into WhatsApp, Instagram, email or any other app.");
    } catch (cause) {
      Alert.alert("Unable to share", cause instanceof Error ? cause.message : "Please try again.");
    }
  };

  const openEnquiry = (item?: VendorPackage) => {
    setEnquiryPackage(item ?? null);
    setEnquiryOpen(true);
  };

  const closeEnquiry = () => {
    setEnquiryOpen(false);
    setEnquiryPackage(null);
  };

  const packagesCard = (
    <PackagesCard
      price={vendor.startingPrice}
      dark={dark}
      subtitle={vendor.services.length ? `${vendor.services.length} active ${vendor.services.length === 1 ? "package" : "packages"} available` : "Request a custom package"}
      onPress={() => setPackagesVisible(true)}
    />
  );

  const portfolioSection = vendor.portfolioAlbums.length ? (
    <View style={styles.portfolioSection}>
      <SectionErrorBoundary label="Portfolio" key={`portfolio-${vendor.id}`}>
        <PortfolioAlbums
          albums={vendor.portfolioAlbums}
          dark={dark}
          onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id, src: explicitSource } })}
          onOpenAlbum={(album) => setSelectedAlbum(album)}
        />
      </SectionErrorBoundary>
    </View>
  ) : null;

  const aboutSection = (
    <View style={[styles.sectionCard, sectionCardStyle]}>
      <SectionHeading dark={dark}>About</SectionHeading>
      {vendor.experience != null ? (
        <View style={styles.experienceRow}>
          <Briefcase size={14} color={PINK} />
          <Text style={[styles.experienceText, { color: muted }]}>
            {vendor.experience} {vendor.experience === 1 ? "year" : "years"} of experience
          </Text>
        </View>
      ) : null}
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
    </View>
  );

  const businessDetails = <>
    {vendor.services.length ? <View style={[styles.sectionCard, sectionCardStyle]}><SectionHeading dark={dark}>Services</SectionHeading><ServiceChips services={vendor.services} dark={dark} /></View> : null}
    {vendor.awards.length ? <View style={[styles.sectionCard, sectionCardStyle]}><SectionHeading dark={dark}>Awards</SectionHeading><AwardsSection awards={vendor.awards} dark={dark} /></View> : null}
    {vendor.languages.length ? <View style={[styles.sectionCard, sectionCardStyle]}><SectionHeading dark={dark}>Languages</SectionHeading><LanguagesSection languages={vendor.languages} dark={dark} /></View> : null}
    {vendor.businessHours?.length ? <View style={[styles.sectionCard, sectionCardStyle]}><SectionHeading dark={dark}>Business Hours</SectionHeading><BusinessHoursSection hours={vendor.businessHours} dark={dark} /></View> : null}
    {vendor.faqs.length ? <View style={[styles.sectionCard, sectionCardStyle]}><SectionHeading dark={dark}>FAQs</SectionHeading><FaqSection faqs={vendor.faqs} dark={dark} /></View> : null}
  </>;

  const reviewsSection = <View style={[styles.sectionCard, styles.reviewsSection, sectionCardStyle]}><ConnectedVendorReviews vendorKey={vendor.id} vendorSlug={vendor.slug} dark={dark} /></View>;


  // Wide web and tablet windows share the editorial split composition. Phone
  // windows keep the original touch-first, single-column path below.
  if (desktop) {
    const splitHeroHeight = tabletProfile
      ? Math.max(420, Math.min(600, height - insets.top - 104))
      : Math.max(500, Math.min(640, height - 170));

    return (
      <View style={[styles.root, { backgroundColor: background }]}>
        <PublicWebNavbar activeRoute="Categories" showMobile={tabletProfile} includeSafeTop={tabletProfile} />
        <View style={[styles.desktopSplit, { borderColor: sectionDivider }]}>
          <View style={[styles.desktopPane, styles.desktopMediaPane, styles.desktopMediaContent, tabletProfile && styles.tabletMediaContent]}>
            <View style={[styles.desktopHeroShell, tabletProfile && styles.tabletHeroShell, { height: splitHeroHeight, backgroundColor: dark ? "#05070C" : "#F8EEF2" }]}>
              <VendorHeroCarousel
                images={heroImages}
                fallbackImage={fallbackImage}
                vendorName={vendor.name}
                containMedia
                height={splitHeroHeight}
                focalPoints={heroFocalPoints}
                paused={heroViewerIndex !== null || calendarVisible || packagesVisible || enquiryOpen || Boolean(enquiryPackage)}
                onOpen={vendor.heroMedia.length ? setHeroViewerIndex : undefined}
              />
            </View>
          </View>

          <ScrollView
            style={[styles.desktopPane, styles.desktopDetailsPane, { borderColor: sectionDivider }]}
            contentContainerStyle={[styles.desktopDetailsContent, tabletProfile && styles.tabletDetailsContent]}
            showsVerticalScrollIndicator={false}
          >
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
            />
            <View style={styles.desktopDetailSection}>
              <VendorDirectBookingSection
                vendorId={vendor.id}
                vendorName={vendor.name}
                vendorCategory={category}
                packages={vendorPackages}
                loadingPackages={loadingPackages}
                dark={dark}
                onCheckAvailability={() => setCalendarVisible(true)}
                onSendEnquiry={() => openEnquiry()}
                onProceedToBook={(data) => {
                  setBookingData(data);
                  setBookingCheckoutOpen(true);
                }}
              />
            </View>
            <View style={styles.desktopProfileMedia}>{portfolioSection}</View>
            <View style={[styles.desktopDetailSection, styles.desktopEditorialSection]}>{aboutSection}</View>
            <View style={[styles.desktopDetailSection, styles.desktopEditorialSection]}>{businessDetails}</View>
            <View style={[styles.desktopDetailSection, styles.desktopEditorialSection]}>{reviewsSection}</View>
          </ScrollView>
        </View>

        <FullscreenMediaViewer
          visible={heroViewerIndex !== null}
          media={vendor.heroMedia}
          initialIndex={heroViewerIndex ?? 0}
          title={`${vendor.name} · Hero gallery`}
          onClose={() => setHeroViewerIndex(null)}
        />
        {packagesVisible ? <PackageDetailsModal
          visible
          vendorId={vendor.id}
          vendorName={vendor.name}
          contactPhone={vendor.contactPhone}
          dark={dark}
          onClose={() => setPackagesVisible(false)}
          onCall={(item) => { setPackagesVisible(false); setTimeout(() => requestVendorContact("call", item), 0); }}
          onWhatsApp={(item) => { setPackagesVisible(false); setTimeout(() => requestVendorContact("whatsapp", item), 0); }}
          onEnquire={(item) => { setPackagesVisible(false); setTimeout(() => openEnquiry(item), 0); }}
          onBook={(item) => { setPackagesVisible(false); setTimeout(() => setBookingPackage(item), 0); }}
        /> : null}
        {bookingCheckoutOpen && bookingData ? (
          <BookingCheckoutModal
            visible
            vendorId={vendor.id}
            vendorName={vendor.name}
            vendorPhone={vendor.contactPhone}
            vendorImage={vendor.heroMedia[0]?.secure_url || vendor.image || null}
            vendorCategory={category}
            selectedPackages={bookingData.selectedPackages}
            initialAddOns={bookingData.selectedAddOns}
            initialStartDate={bookingData.startDate}
            initialEndDate={bookingData.endDate}
            initialTotalDays={bookingData.totalDays}
            dark={dark}
            onClose={() => {
              setBookingCheckoutOpen(false);
              setBookingData(null);
            }}
          />
        ) : null}
        {bookingPackage ? <BookingCheckoutModal
          visible
          vendorId={vendor.id}
          vendorName={vendor.name}
          vendorPhone={vendor.contactPhone}
          vendorImage={vendor.heroMedia[0]?.secure_url || vendor.image || null}
          vendorCategory={category}
          selectedPackage={bookingPackage}
          dark={dark}
          onClose={() => setBookingPackage(null)}
        /> : null}
        <CustomerEnquiryModal
          visible={enquiryOpen}
          vendorId={vendor.id}
          vendorName={vendor.name}
          vendorCategory={category}
          selectedPackage={enquiryPackage}
          dark={dark}
          onClose={closeEnquiry}
        />
        <VendorAvailabilityModal visible={calendarVisible} vendorId={vendor.id} vendorName={vendor.name} availability={vendor.availability} dark={dark} onClose={() => setCalendarVisible(false)} />
        <DownloadAppPopup dark={dark} />
        {tabletProfile ? <StandaloneMobileTabBar activeRoute={null} /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <PinnedHeroProfileLayout
        header={<PublicWebNavbar activeRoute="Categories" showMobile includeSafeTop />}
        heroHeight={heroHeight}
        pageWidth={contentWidth}
        overlap={desktop ? 24 : 20}
        heroHorizontalInset={desktop ? 0 : width < 480 ? 12 : 18}
        heroTopInset={desktop ? 0 : 12}
        backgroundColor={background}
        sheetColor={background}
        contentContainerStyle={{ paddingBottom: desktop ? 28 : mobileTabBarHeight }}
        hero={(
          <VendorHeroCarousel
            images={heroImages}
            fallbackImage={fallbackImage}
            vendorName={vendor.name}
            containMedia={tabletPortrait || !vendor.heroMedia.length}
            height={heroHeight}
            focalPoints={heroFocalPoints}
            paused={heroViewerIndex !== null || calendarVisible || packagesVisible || enquiryOpen || Boolean(enquiryPackage)}
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
          />

        <View style={[styles.content, width < 600 && styles.contentCompact]}>
          <VendorDirectBookingSection
            vendorId={vendor.id}
            vendorName={vendor.name}
            vendorCategory={category}
            packages={vendorPackages}
            loadingPackages={loadingPackages}
            dark={dark}
            onCheckAvailability={() => setCalendarVisible(true)}
            onSendEnquiry={() => openEnquiry()}
            onProceedToBook={(data) => {
              setBookingData(data);
              setBookingCheckoutOpen(true);
            }}
          />
          {portfolioSection}
          {aboutSection}
          {businessDetails}
          {reviewsSection}
        </View>
      </PinnedHeroProfileLayout>

      <FullscreenMediaViewer
        visible={heroViewerIndex !== null}
        media={vendor.heroMedia}
        initialIndex={heroViewerIndex ?? 0}
        title={`${vendor.name} · Hero gallery`}
        onClose={() => setHeroViewerIndex(null)}
      />
      <PortfolioAlbumModal
        visible={selectedAlbum !== null}
        album={selectedAlbum}
        vendorName={vendor.name}
        dark={dark}
        onClose={() => setSelectedAlbum(null)}
      />
      {packagesVisible ? (
        <PackageDetailsModal
          visible
          vendorId={vendor.id}
          vendorName={vendor.name}
          contactPhone={vendor.contactPhone}
          dark={dark}
          onClose={() => setPackagesVisible(false)}
          onCall={(item) => {
            setPackagesVisible(false);
            setTimeout(() => requestVendorContact("call", item), 0);
          }}
          onWhatsApp={(item) => {
            setPackagesVisible(false);
            setTimeout(() => requestVendorContact("whatsapp", item), 0);
          }}
          onEnquire={(item) => {
            setPackagesVisible(false);
            setTimeout(() => openEnquiry(item), 0);
          }}
          onBook={(item) => {
            setPackagesVisible(false);
            setTimeout(() => setBookingPackage(item), 0);
          }}
        />
      ) : null}
      {bookingCheckoutOpen && bookingData ? (
        <BookingCheckoutModal
          visible
          vendorId={vendor.id}
          vendorName={vendor.name}
          vendorPhone={vendor.contactPhone}
          vendorImage={vendor.heroMedia[0]?.secure_url || vendor.image || null}
          vendorCategory={category}
          selectedPackages={bookingData.selectedPackages}
          initialAddOns={bookingData.selectedAddOns}
          initialStartDate={bookingData.startDate}
          initialEndDate={bookingData.endDate}
          initialTotalDays={bookingData.totalDays}
          dark={dark}
          onClose={() => {
            setBookingCheckoutOpen(false);
            setBookingData(null);
          }}
        />
      ) : null}
      {bookingPackage ? (
        <BookingCheckoutModal
          visible
          vendorId={vendor.id}
          vendorName={vendor.name}
          vendorPhone={vendor.contactPhone}
          vendorImage={vendor.heroMedia[0]?.secure_url || vendor.image || null}
          vendorCategory={category}
          selectedPackage={bookingPackage}
          dark={dark}
          onClose={() => setBookingPackage(null)}
        />
      ) : null}
      <CustomerEnquiryModal
        visible={enquiryOpen}
        vendorId={vendor.id}
        vendorName={vendor.name}
        vendorCategory={category}
        selectedPackage={enquiryPackage}
        dark={dark}
        onClose={closeEnquiry}
      />
      <VendorAvailabilityModal
        visible={calendarVisible}
        vendorId={vendor.id}
        vendorName={vendor.name}
        availability={vendor.availability}
        dark={dark}
        onClose={() => setCalendarVisible(false)}
      />
      <DownloadAppPopup dark={dark} />
      {!desktop ? <StandaloneMobileTabBar activeRoute={null} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  content: { width: "100%", maxWidth: 960, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18 },
  contentCompact: { paddingHorizontal: 16, paddingTop: 16 },
  desktopSplit: { flex: 1, width: "100%", flexDirection: "row", overflow: "hidden" },
  desktopPane: { flex: 1 },
  desktopMediaPane: { flexBasis: "40%" },
  desktopDetailsPane: { flexBasis: "60%", borderLeftWidth: StyleSheet.hairlineWidth },
  desktopMediaContent: { paddingHorizontal: 32, paddingTop: 32, paddingBottom: 64 },
  desktopDetailsContent: { paddingHorizontal: 40, paddingTop: 34, paddingBottom: 64 },
  tabletMediaContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  tabletDetailsContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  desktopHeroShell: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#7B304B",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  tabletHeroShell: { borderRadius: 14 },
  desktopProfileMedia: { marginTop: 22 },
  desktopCategoryRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  desktopCategory: { color: PINK, fontFamily: typeStyles.button.fontFamily, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, letterSpacing: 0.45 },
  desktopCategoryRule: { flex: 1, height: StyleSheet.hairlineWidth },
  desktopDetailSection: { marginTop: 24 },
  desktopEditorialSection: { paddingTop: 26, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F2DDE5" },
  sectionCard: {
    marginTop: 14,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: "#3C2028",
    shadowOpacity: 0.055,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  portfolioSection: { marginTop: 2 },
  reviewsSection: { marginBottom: 16 },
  sectionHeadingWrap: { alignSelf: "flex-start", marginBottom: 10 },
  sectionHeading: {
    ...typeStyles.editorialCardTitle,
  },
  ornament: { width: 64, height: 7, flexDirection: "row", alignItems: "center", gap: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#FACC15" },
  ornamentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#FACC15" },
  aboutText: { maxWidth: 900, ...typeStyles.body },
  experienceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  experienceText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
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
  readMoreText: { color: PINK, ...typeStyles.button },
  pressed: { opacity: 0.7 },
  notFoundTitle: { ...typeStyles.editorialSectionTitle },
  loadError: { maxWidth: 480, marginTop: 8, textAlign: "center", fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact },
  goBack: {
    minHeight: 44,
    marginTop: 16,
    borderRadius: 22,
    paddingHorizontal: 22,
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
  },
  goBackText: { color: "#FFFFFF", fontSize: typeScale.body, fontWeight: "700" },
});
