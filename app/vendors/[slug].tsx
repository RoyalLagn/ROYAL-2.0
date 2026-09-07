import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, useWindowDimensions, View, } from "react-native";
// NativeWind's native Pressable interop doesn't resolve a function
// `style={(state) => [...]}` prop on Android (whole style silently drops).
// InteropSafePressable resolves it first. See VendorCalendar.tsx /
// AppDialogProvider.tsx / VendorProfileTabs.tsx for the same fix.
import Pressable from "@/components/InteropSafePressable";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { Briefcase, ChevronRight, Send, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PublicClip } from "@/clips/types";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { PublicClipService } from "@/clips/services";
import { useFavorites } from "@/context/FavoritesContext";
import PageLoader from "@/components/loading/PageLoader";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import { StandaloneMobileTabBar, useMobileTabBarHeight } from "@/components/MobileTabBar";
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
  type VendorProfileTab,
} from "@/components/vendor-profile/VendorProfileTabs";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import AwardsSection from "@/components/vendor-profile/AwardsSection";
import LanguagesSection from "@/components/vendor-profile/LanguagesSection";
import BusinessHoursSection from "@/components/vendor-profile/BusinessHoursSection";
import FaqSection from "@/components/vendor-profile/FaqSection";
import DownloadAppPopup from "@/components/vendor-profile/DownloadAppPopup";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { recordPublicVendorProfileView } from "@/services/publicVendorListings";
import { portfolioMediaUrl } from "@/services/vendorPortfolio";
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
import { buildVendorProfilePathBySlug, vendorWebBase } from "@/services/contactActions";
import { usePublicClipsAvailability } from "@/hooks/usePublicClipsAvailability";

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
  const desktop = width >= 1100;
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
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryMessage, setEnquiryMessage] = useState("");
  const [enquiryStatus, setEnquiryStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [enquiryError, setEnquiryError] = useState("");
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
          router.replace({ pathname: "/vendor/[slug]", params: { slug: result.slug, src: explicitSource } });
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
    if (!vendor?.id) return;
    let active = true;
    setSelectedTab("portfolio");
    void AsyncStorage.getItem(`royallagn:vendor-profile-tab:${vendor.id}`)
      .then((saved) => {
        if (active && (saved === "portfolio" || saved === "clips")) setSelectedTab(saved);
      })
      .catch(() => {
        // The in-memory selection still works when local persistence is unavailable.
      });
    return () => {
      active = false;
    };
  }, [vendor?.id]);

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

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !vendor) return;
    const url = slug ? `${vendorWebBase()}${buildVendorProfilePathBySlug(slug)}` : "";
    const description = vendor.description?.trim()
      || `${vendor.name} on RoyalLagn — ${vendor.category} in ${vendor.location}.`;
    const image = vendor.heroMedia.length ? portfolioMediaUrl(vendor.heroMedia[0], "hero") : vendor.image;

    document.title = `${vendor.name}${vendor.location ? ` · ${vendor.location}` : ""} | RoyalLagn`;

    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };
    setMeta("name", "description", description);
    setMeta("property", "og:title", vendor.name);
    setMeta("property", "og:description", description);
    if (image) setMeta("property", "og:image", image);
    if (url) setMeta("property", "og:url", url);
    setMeta("property", "og:type", "business.business");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", vendor.name);
    setMeta("name", "twitter:description", description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    if (url) canonical.setAttribute("href", url);

    let jsonLd = document.getElementById("vendor-jsonld");
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.id = "vendor-jsonld";
      jsonLd.setAttribute("type", "application/ld+json");
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "@id": `${url}#business`,
      name: vendor.name,
      image: image ? [image] : undefined,
      description,
      url: url || undefined,
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
      : Math.max(340, Math.min(500, width * 1.18, usableHeight * 0.52));
  }, [desktop, height, insets.bottom, insets.top, width]);
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
  const selectProfileTab = (tab: VendorProfileTab) => {
    setSelectedTab(tab);
    void AsyncStorage.setItem(`royallagn:vendor-profile-tab:${vendor.id}`, tab).catch(() => {
      // Persisting the selected tab is an enhancement, not a navigation dependency.
    });
  };
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

  const handleSendEnquiry = async () => {
    if (!isPublicAuthenticated) {
      setEnquiryOpen(false);
      router.push("/Login");
      return;
    }
    if (!profile?.email || !profile?.phone) {
      setEnquiryOpen(false);
      Alert.alert("Complete your contact details", "Add your email and mobile number to your RoyalLagn profile before sending an enquiry.", [
        { text: "Cancel", style: "cancel" },
        { text: "Update profile", onPress: () => router.push("/EditProfile") },
      ]);
      return;
    }
    if (enquiryMessage.trim().length < 10) {
      setEnquiryError("Please add a short message of at least 10 characters.");
      return;
    }
    setEnquiryStatus("sending");
    setEnquiryError("");
    try {
      const tracked = await EnquiryService.createFormEnquiry({
        vendorId: vendor.id,
        message: enquiryMessage,
        source: "vendor_profile",
      });
      void recordVendorProfileEvent(vendor.id, "enquiry").catch(() => {});
      setEnquiryStatus("idle");
      setEnquiryMessage("");
      setEnquiryOpen(false);
      Alert.alert("Enquiry sent", `${vendor.name} received your enquiry. Reference: ${tracked.referenceCode}`);
    } catch (cause) {
      setEnquiryStatus("error");
      setEnquiryError(cause instanceof Error ? cause.message : "The enquiry could not be sent.");
    }
  };

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
            containMedia={!vendor.heroMedia.length}
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
        >
          <VendorQuickActions
            dark={dark}
            onCall={() => requestVendorContact("call")}
            onWhatsApp={() => requestVendorContact("whatsapp")}
            onEnquire={() => {
              if (!isPublicAuthenticated) { router.push("/Login"); return; }
              if (!profile?.email || !profile?.phone) {
                Alert.alert("Complete your contact details", "Add your email and mobile number to your RoyalLagn profile before sending an enquiry.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Update profile", onPress: () => router.push("/EditProfile") },
                ]);
                return;
              }
              setEnquiryError(""); setEnquiryStatus("idle"); setEnquiryOpen(true);
            }}
            onCalendar={() => setCalendarVisible(true)}
          />
        </VendorInfoPanel>

        <View style={[styles.content, width < 600 && styles.contentCompact]}>
          <PackagesCard
            price={vendor.startingPrice}
            dark={dark}
            subtitle={vendor.services.length ? `${vendor.services.length} active ${vendor.services.length === 1 ? "package" : "packages"} available` : "Request a custom package"}
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
                  onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id, src: explicitSource } })}
                  onOpenAlbum={(album) => router.push({
                    pathname: "/VendorAlbum",
                    params: { vendorId: vendor.id, albumId: album.id, src: explicitSource },
                  })}
                />
              </SectionErrorBoundary>
            </View> : null
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

          {vendor.awards.length ? (
            <View style={[styles.sectionCard, sectionCardStyle]}>
              <SectionHeading dark={dark}>Awards</SectionHeading>
              <AwardsSection awards={vendor.awards} dark={dark} />
            </View>
          ) : null}

          {vendor.languages.length ? (
            <View style={[styles.sectionCard, sectionCardStyle]}>
              <SectionHeading dark={dark}>Languages</SectionHeading>
              <LanguagesSection languages={vendor.languages} dark={dark} />
            </View>
          ) : null}

          {vendor.businessHours?.length ? (
            <View style={[styles.sectionCard, sectionCardStyle]}>
              <SectionHeading dark={dark}>Business Hours</SectionHeading>
              <BusinessHoursSection hours={vendor.businessHours} dark={dark} />
            </View>
          ) : null}

          {vendor.faqs.length ? (
            <View style={[styles.sectionCard, sectionCardStyle]}>
              <SectionHeading dark={dark}>FAQs</SectionHeading>
              <FaqSection faqs={vendor.faqs} dark={dark} />
            </View>
          ) : null}

          <View style={[styles.sectionCard, styles.reviewsSection, sectionCardStyle]}>
            <ConnectedVendorReviews vendorKey={vendor.id} vendorSlug={vendor.slug} dark={dark} />
          </View>
        </View>
      </PinnedHeroProfileLayout>

      <FullscreenMediaViewer
        visible={heroViewerIndex !== null}
        media={vendor.heroMedia}
        initialIndex={heroViewerIndex ?? 0}
        title={`${vendor.name} · Hero gallery`}
        onClose={() => setHeroViewerIndex(null)}
      />
      {packagesVisible && !enquiryPackage ? (
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
            setEnquiryPackage(item);
          }}
        />
      ) : null}
      {enquiryPackage ? <PackageEnquiryModal
        visible
        vendorId={vendor.id}
        vendorName={vendor.name}
        item={enquiryPackage}
        dark={dark}
        onClose={() => setEnquiryPackage(null)}
        onSignInRequired={() => {
          setEnquiryPackage(null);
          setTimeout(() => Alert.alert(
              "Sign in required for packages",
              "Package requests need a RoyalLagn account. You can still reach this vendor with the Send Enquiry or WhatsApp button as a guest.",
            ), 0);
        }}
        onSent={(referenceCode) => {
          setEnquiryPackage(null);
          setTimeout(() => Alert.alert("Enquiry saved", `${vendor.name} received your package enquiry. Reference: ${referenceCode}`), 0);
        }}
      /> : null}
      <AnimatedBottomSheet
        visible={enquiryOpen}
        onRequestClose={() => { if (enquiryStatus !== "sending") setEnquiryOpen(false); }}
        variant={width >= 700 ? "center" : "sheet"}
        keyboardAware
        sheetStyle={[styles.enquirySheet, width >= 700 && styles.enquirySheetDesktop, { backgroundColor: surface, borderColor: sectionDivider }]}
      >
        <View style={styles.enquiryHeader}>
          <View style={styles.enquiryIcon}><Send size={20} color={PINK} /></View>
          <View style={styles.enquiryHeaderCopy}><Text style={[styles.enquiryTitle, { color: text }]}>Send Enquiry</Text><Text numberOfLines={1} style={[styles.enquirySubtitle, { color: muted }]}>Tell {vendor.name} what you need</Text></View>
          <Pressable disabled={enquiryStatus === "sending"} onPress={() => setEnquiryOpen(false)} accessibilityLabel="Close enquiry" style={[styles.enquiryClose, { backgroundColor: background }]}><X size={20} color={text} /></Pressable>
        </View>
        <Text style={[styles.enquiryProfileNote, { color: muted }]}>Your profile email and mobile number will be shared with this vendor.</Text>
        <TextInput
          autoFocus={Platform.OS === "web"}
          value={enquiryMessage}
          onChangeText={(value) => { setEnquiryMessage(value); setEnquiryError(""); }}
          placeholder="Tell us about your event..."
          placeholderTextColor={muted}
          multiline
          style={[styles.enquiryInput, { color: text, borderColor: sectionDivider, backgroundColor: background }]}
        />
        {enquiryError ? <Text accessibilityRole="alert" style={styles.enquiryErrorText}>{enquiryError}</Text> : null}
        <Pressable style={[styles.enquirySubmit, { backgroundColor: PINK }]} disabled={enquiryStatus === "sending"} onPress={() => void handleSendEnquiry()}>
          {enquiryStatus === "sending" ? <ActivityIndicator color="#FFFFFF" /> : <><Send size={16} color="#FFFFFF" /><Text style={styles.enquirySubmitText}>Send enquiry</Text></>}
        </Pressable>
      </AnimatedBottomSheet>
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
      <DownloadAppPopup dark={dark} />
      {!desktop ? <StandaloneMobileTabBar activeRoute={null} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  content: { width: "100%", maxWidth: 960, alignSelf: "center", paddingHorizontal: 20, paddingTop: 16 },
  contentCompact: { paddingHorizontal: 14, paddingTop: 14 },
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
  enquirySheet: { width: "100%", maxHeight: "92%", borderWidth: 1, padding: 18 },
  enquirySheetDesktop: { maxWidth: 560, borderRadius: 28, paddingBottom: 24 },
  enquiryHeader: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 },
  enquiryIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: `${PINK}12`, alignItems: "center", justifyContent: "center" },
  enquiryHeaderCopy: { flex: 1, minWidth: 0 },
  enquiryTitle: { ...typeStyles.editorialCardTitle },
  enquirySubtitle: { fontSize: typeScale.caption, marginTop: 2 },
  enquiryClose: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  enquiryInput: { minHeight: 120, borderWidth: 1, borderRadius: 14, padding: 13, fontSize: typeScale.body, textAlignVertical: "top" },
  enquiryProfileNote: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginBottom: 10 },
  enquiryErrorText: { color: "#DC2626", fontSize: typeScale.bodyCompact, marginTop: 6 },
  enquirySubmit: { marginTop: 12, minHeight: 50, borderRadius: 15, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  enquirySubmitText: { color: "#FFFFFF", fontWeight: "700", fontSize: typeScale.body },
});
