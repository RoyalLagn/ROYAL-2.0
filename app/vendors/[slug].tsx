import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { ChevronRight } from "lucide-react-native";
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
  type VendorProfileTab,
} from "@/components/vendor-profile/VendorProfileTabs";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import AwardsSection from "@/components/vendor-profile/AwardsSection";
import LanguagesSection from "@/components/vendor-profile/LanguagesSection";
import BusinessHoursSection from "@/components/vendor-profile/BusinessHoursSection";
import FaqSection from "@/components/vendor-profile/FaqSection";
import GetDirectionsButton from "@/components/vendor-profile/GetDirectionsButton";
import DownloadAppPopup from "@/components/vendor-profile/DownloadAppPopup";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
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
} from "@/services/vendorPublicProfile";
import { resolveTrafficSource } from "@/services/trafficSource";
import type { PublicVendorListing } from "@/services/publicVendorListings";

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

type LoadState = "loading" | "found" | "not_found";

export default function VendorPublicProfileScreen() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const dark = colorScheme === "dark";
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 1100;
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [state, setState] = useState<LoadState>("loading");
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const category = vendor?.category ?? "";
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
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryMessage, setEnquiryMessage] = useState("");
  const [enquiryStatus, setEnquiryStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [enquiryError, setEnquiryError] = useState("");

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
          router.replace({ pathname: "/vendors/[slug]", params: { slug: result.slug } });
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
  }, [slug, router]);

  useEffect(() => {
    if (!vendor?.id) return;
    void recordPublicVendorProfileView(vendor.id).catch(() => {
      // Profile viewing must never block the public vendor page.
    });
    const source = resolveTrafficSource();
    void recordVendorProfileEvent(vendor.id, "view", source).catch(() => {
      // Analytics must never block the public vendor page.
    });
  }, [vendor?.id]);

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

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !vendor) return;
    const url = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
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
      name: vendor.name,
      image: image || undefined,
      description,
      address: vendor.address || vendor.location || undefined,
      telephone: vendor.contactPhone || undefined,
      url: url || undefined,
      ...(vendor.reviews
        ? { aggregateRating: { "@type": "AggregateRating", ratingValue: vendor.rating, reviewCount: vendor.reviews } }
        : {}),
    });
  }, [vendor]);

  const background = dark ? "#070B14" : "#FFF8FA";
  const surface = dark ? "#0E141F" : "#FFFFFF";
  const text = dark ? "#FFF8FB" : "#1D1519";
  const muted = dark ? "#C6BAC0" : "#62575D";
  const sectionDivider = dark ? "#303846" : "#ECE7EA";
  const contentWidth = Math.min(width, 1120);
  const heroHeight = useMemo(() => {
    const usableHeight = Math.max(520, height - insets.top - insets.bottom);
    return desktop
      ? Math.max(420, Math.min(520, usableHeight * 0.5))
      : Math.max(300, Math.min(460, usableHeight * 0.42));
  }, [desktop, height, insets.bottom, insets.top]);
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
      <View style={[styles.root, styles.centered, { backgroundColor: background }]}>
        <ActivityIndicator color={PINK} size="large" />
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
    }
  };

  const shareProfile = async () => {
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

  const openWebsite = () => {
    void recordVendorProfileEvent(vendor.id, "website_click").catch(() => {});
  };
  const openInstagram = () => {
    void recordVendorProfileEvent(vendor.id, "instagram_click").catch(() => {});
  };

  const handleSendEnquiry = async () => {
    if (enquiryMessage.trim().length < 10) {
      setEnquiryError("Please add a short message of at least 10 characters.");
      return;
    }
    setEnquiryStatus("sending");
    setEnquiryError("");
    try {
      await EnquiryService.createFormEnquiry({
        vendorId: vendor.id,
        message: enquiryMessage,
        source: "vendor_profile",
      });
      void recordVendorProfileEvent(vendor.id, "enquiry").catch(() => {});
      setEnquiryStatus("sent");
    } catch (cause) {
      setEnquiryStatus("error");
      setEnquiryError(cause instanceof Error ? cause.message : "The enquiry could not be sent.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <PinnedHeroProfileLayout
        heroHeight={heroHeight}
        pageWidth={contentWidth}
        overlap={24}
        backgroundColor={background}
        sheetColor={background}
        contentContainerStyle={{ paddingBottom: 28 }}
        hero={(
          <VendorHeroCarousel
            images={heroImages}
            fallbackImage={fallbackImage}
            vendorName={vendor.name}
            height={heroHeight}
            onBack={() => router.replace("/")}
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
          overlap={false}
        >
          <VendorQuickActions
            dark={dark}
            onCall={() => void contactVendor("call")}
            onWhatsApp={() => void contactVendor("whatsapp")}
            onEnquire={() => setEnquiryOpen((open) => !open)}
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

          {enquiryOpen ? (
            <View style={[styles.sectionCard, sectionCardStyle]}>
              {enquiryStatus === "sent" ? (
                <Text style={[styles.aboutText, { color: text }]}>
                  Thanks! Your enquiry has been sent to {vendor.name}.
                </Text>
              ) : (
                <>
                  <SectionHeading dark={dark}>Send Enquiry</SectionHeading>
                  <TextInput
                    value={enquiryMessage}
                    onChangeText={setEnquiryMessage}
                    placeholder="Tell us about your event..."
                    placeholderTextColor={muted}
                    multiline
                    style={[styles.enquiryInput, { color: text, borderColor: sectionDivider }]}
                  />
                  {enquiryError ? <Text style={styles.enquiryErrorText}>{enquiryError}</Text> : null}
                  <Pressable
                    style={[styles.enquirySubmit, { backgroundColor: PINK, opacity: enquiryStatus === "sending" ? 0.6 : 1 }]}
                    disabled={enquiryStatus === "sending"}
                    onPress={() => void handleSendEnquiry()}
                  >
                    <Text style={styles.enquirySubmitText}>{enquiryStatus === "sending" ? "Sending..." : "Send"}</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}

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
            </View> : null
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
            <View style={styles.directionsRow}>
              <GetDirectionsButton address={vendor.address} city={vendor.location} />
            </View>
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

          {(vendor.website || vendor.instagram) ? (
            <View style={[styles.sectionCard, sectionCardStyle, styles.linksRow]}>
              {vendor.website ? (
                <Pressable
                  style={styles.linkChip}
                  onPress={() => { openWebsite(); void Linking.openURL(vendor.website); }}
                >
                  <Text style={styles.linkChipText}>Website</Text>
                </Pressable>
              ) : null}
              {vendor.instagram ? (
                <Pressable
                  style={styles.linkChip}
                  onPress={() => { openInstagram(); void Linking.openURL(vendor.instagram); }}
                >
                  <Text style={styles.linkChipText}>Instagram</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {vendor.faqs.length ? (
            <View style={[styles.sectionCard, sectionCardStyle]}>
              <SectionHeading dark={dark}>FAQs</SectionHeading>
              <FaqSection faqs={vendor.faqs} dark={dark} />
            </View>
          ) : null}

          <View style={[styles.sectionCard, styles.reviewsSection, sectionCardStyle]}>
            <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
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
        onSignInRequired={() => {
          setEnquiryPackage(null);
          Alert.alert(
            "Sign in required for packages",
            "Package requests need a RoyalLagn account. You can still reach this vendor with the Send Enquiry or WhatsApp button as a guest.",
          );
        }}
        onSent={() => setEnquiryPackage(null)}
      />
      <VendorAvailabilityModal
        visible={calendarVisible}
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
      <DownloadAppPopup dark={dark} />
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

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
    shadowColor: "#6F3048",
    shadowOpacity: 0.025,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  portfolioSection: { marginTop: 2 },
  reviewsSection: { marginBottom: 16 },
  sectionHeadingWrap: { alignSelf: "flex-start", marginBottom: 10 },
  sectionHeading: {
    fontFamily: serif,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  ornament: { width: 64, height: 7, flexDirection: "row", alignItems: "center", gap: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#D6A054" },
  ornamentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D6A054" },
  aboutText: { maxWidth: 900, fontSize: 13, lineHeight: 20, fontWeight: "400" },
  directionsRow: { marginTop: 12 },
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
  readMoreText: { color: PINK, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.7 },
  notFoundTitle: { fontFamily: serif, fontSize: 23, fontWeight: "700" },
  loadError: { maxWidth: 480, marginTop: 8, textAlign: "center", fontSize: 13, lineHeight: 19 },
  goBack: {
    minHeight: 44,
    marginTop: 16,
    borderRadius: 22,
    paddingHorizontal: 22,
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
  },
  goBackText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  enquiryInput: { minHeight: 88, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, textAlignVertical: "top" },
  enquiryErrorText: { color: "#DC2626", fontSize: 12, marginTop: 6 },
  enquirySubmit: { marginTop: 12, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  enquirySubmitText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  linksRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  linkChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: PINK, alignItems: "center", justifyContent: "center" },
  linkChipText: { color: PINK, fontSize: 12, fontWeight: "700" },
});
