import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFavorites } from "@/context/FavoritesContext";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import PackagesCard from "@/components/vendor-profile/PackagesCard";
import FullscreenMediaViewer from "@/components/vendor-profile/FullscreenMediaViewer";
import PortfolioAlbums from "@/components/vendor-profile/PortfolioAlbums";
import ServiceChips from "@/components/vendor-profile/ServiceChips";
import VendorHeroCarousel from "@/components/vendor-profile/VendorHeroCarousel";
import VendorInfoPanel from "@/components/vendor-profile/VendorInfoPanel";
import VendorQuickActions from "@/components/vendor-profile/VendorQuickActions";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import PublicWebNavbar from "@/components/PublicWebNavbar";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import {
  getApprovedPublicVendorById,
  recordPublicVendorProfileView,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";
import { portfolioMediaUrl } from "@/services/vendorPortfolio";
import { resolveMarketplaceCategoryImage } from "@/data/marketplaceCategories";

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
  const dark = colorScheme === "dark";
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 1100;
  const params = useLocalSearchParams<{ vendorId?: string; category?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const paramCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const category = vendor?.category ?? paramCategory ?? "Photographers";
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const [expanded, setExpanded] = useState(false);
  const [heroViewerIndex, setHeroViewerIndex] = useState<number | null>(null);

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
  }, [vendorId]);

  useEffect(() => {
    if (!vendor?.id) return;
    void recordPublicVendorProfileView(vendor.id).catch(() => {
      // Profile viewing must never block the public Vendor page.
    });
  }, [vendor?.id]);

  const background = dark ? "#070B14" : "#FFF9FB";
  const surface = dark ? "#0E141F" : "#FFFFFF";
  const text = dark ? "#FFF8FB" : "#1D1519";
  const muted = dark ? "#C6BAC0" : "#62575D";
  const sectionSurface = dark ? "#151B27" : "#FFFFFF";
  const sectionBorder = dark ? "#2D3748" : "#F0DDE4";
  const contentWidth = Math.min(width, 1120);
  const sectionCardStyle = {
    backgroundColor: sectionSurface,
    borderColor: sectionBorder,
  };
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
        <View style={styles.notFound}>
          <Text style={[styles.notFoundTitle, { color: text }]}>
            {loading ? "Loading vendor…" : "Vendor is currently unavailable"}
          </Text>
          {!loading ? (
            <>
              {loadError ? <Text style={[styles.loadError, { color: muted }]}>{loadError}</Text> : null}
              <Pressable accessibilityRole="button" onPress={goBack} style={styles.goBack}>
                <Text style={styles.goBackText}>Go back</Text>
              </Pressable>
            </>
          ) : null}
        </View>
        {!desktop ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}
      </View>
    );
  }

  const favorite = isFavorite(vendor.id);
  const displayedRating = getRating(vendor.id, vendor.rating, vendor.reviews);
  const fallbackImage = resolveMarketplaceCategoryImage(category).fallbackSource;
  const vendorDescription = vendor.description?.trim() ?? "";
  const about = vendorDescription.length >= 40
    ? vendorDescription
    : `${vendor.name} is a verified ${category.toLowerCase()} professional serving ${vendor.location}. Explore their services, portfolio and customer reviews to find the right fit for your celebration.`;
  const aboutCopy = expanded || about.length <= 180 ? about : `${about.slice(0, 177).trim()}…`;
  const placeholder = (title: string) =>
    Alert.alert(title, `${title} is available as a local frontend placeholder.`);

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

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <PublicWebNavbar activeRoute="Categories" />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: desktop ? 28 : 92 + insets.bottom }]}
      >
        <View style={[styles.page, { width: contentWidth, backgroundColor: surface }]}>
          <VendorHeroCarousel
            images={heroImages}
            fallbackImage={fallbackImage}
            vendorName={vendor.name}
            onBack={goBack}
            focalPoints={heroFocalPoints}
            paused={heroViewerIndex !== null}
            onOpen={vendor.heroMedia.length ? setHeroViewerIndex : undefined}
          />

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
            onShare={() => Share.share({ message: `View ${vendor.name} on RoyalLagn — ${vendor.location}` })}
          >
            <VendorQuickActions
              dark={dark}
              onCall={() => vendor.contactPhone
                ? Linking.openURL(`tel:${vendor.contactPhone}`)
                : Alert.alert("Contact unavailable", "This vendor has not added a phone number yet.")}
              onWhatsApp={() => vendor.contactPhone
                ? Linking.openURL(`https://wa.me/${vendor.contactPhone.replace(/\D/g, "")}`)
                : Alert.alert("Contact unavailable", "This vendor has not added a WhatsApp number yet.")}
              onEnquire={() => placeholder("Send Enquiry")}
            />
          </VendorInfoPanel>

          <View style={[styles.content, width < 600 && styles.contentCompact]}>
            <PackagesCard
              price={vendor.startingPrice}
              dark={dark}
              onPress={() => placeholder("Packages")}
            />

            <View style={[styles.section, styles.sectionCard, sectionCardStyle]}>
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

            {vendor.contactPhone || vendor.contactEmail || vendor.website || vendor.instagram || vendor.facebook ? (
              <View style={[styles.section, styles.sectionCard, sectionCardStyle]}>
                <SectionHeading dark={dark}>Contact & Social</SectionHeading>
                <View style={styles.contactLinks}>
                  {vendor.contactPhone ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => Linking.openURL(`tel:${vendor.contactPhone}`)}
                      style={[styles.contactLink, {
                        backgroundColor: dark ? "#24202A" : "#FFF3F7",
                        borderColor: dark ? "#4C3540" : "#EDC7D4",
                      }]}
                    >
                      <Text style={[styles.contactLinkText, { color: dark ? "#FF9BBC" : "#922E51" }]}>{vendor.contactPhone}</Text>
                    </Pressable>
                  ) : null}
                  {vendor.contactEmail ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => Linking.openURL(`mailto:${vendor.contactEmail}`)}
                      style={[styles.contactLink, {
                        backgroundColor: dark ? "#24202A" : "#FFF3F7",
                        borderColor: dark ? "#4C3540" : "#EDC7D4",
                      }]}
                    >
                      <Text style={[styles.contactLinkText, { color: dark ? "#FF9BBC" : "#922E51" }]}>{vendor.contactEmail}</Text>
                    </Pressable>
                  ) : null}
                  {[
                    ["Website", vendor.website],
                    ["Instagram", vendor.instagram],
                    ["Facebook", vendor.facebook],
                  ].filter((entry) => entry[1]).map(([label, url]) => (
                    <Pressable
                      key={label}
                      accessibilityRole="link"
                      onPress={() => Linking.openURL(/^https?:\/\//i.test(url) ? url : `https://${url}`)}
                      style={[styles.contactLink, {
                        backgroundColor: dark ? "#24202A" : "#FFF3F7",
                        borderColor: dark ? "#4C3540" : "#EDC7D4",
                      }]}
                    >
                      <Text style={[styles.contactLinkText, { color: dark ? "#FF9BBC" : "#922E51" }]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {vendor.services.length ? (
              <View style={[styles.section, styles.sectionCard, sectionCardStyle]}>
                <SectionHeading dark={dark}>Services</SectionHeading>
                <ServiceChips services={vendor.services} dark={dark} />
              </View>
            ) : null}

            {vendor.portfolioAlbums.length ? <View style={[styles.portfolioSection, styles.sectionCard, sectionCardStyle]}>
              <PortfolioAlbums
                albums={vendor.portfolioAlbums}
                dark={dark}
                onViewAll={() => router.push({ pathname: "/VendorPortfolio", params: { vendorId: vendor.id } })}
                onOpenAlbum={(album) => router.push({
                  pathname: "/VendorAlbum",
                  params: { vendorId: vendor.id, albumId: album.id },
                })}
              />
            </View> : null}

            <View style={[styles.reviewsSection, styles.sectionCard, sectionCardStyle]}>
              <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
            </View>
          </View>
        </View>
      </ScrollView>

      {!desktop ? <StandaloneMobileTabBar activeRoute="Categories" /> : null}
      <FullscreenMediaViewer
        visible={heroViewerIndex !== null}
        media={vendor.heroMedia}
        initialIndex={heroViewerIndex ?? 0}
        title={`${vendor.name} · Hero gallery`}
        onClose={() => setHeroViewerIndex(null)}
      />
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  page: {
    maxWidth: "100%",
    alignSelf: "center",
    overflow: "hidden",
    shadowColor: "#8D5368",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  content: { width: "100%", maxWidth: 960, alignSelf: "center", paddingHorizontal: 22, paddingTop: 16 },
  contentCompact: { paddingHorizontal: 14, paddingTop: 14 },
  section: { marginTop: 16 },
  sectionCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  portfolioSection: { marginTop: 16 },
  reviewsSection: { marginTop: 16, marginBottom: 16 },
  sectionHeadingWrap: { alignSelf: "flex-start", marginBottom: 10 },
  sectionHeading: {
    fontFamily: serif,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  ornament: { width: 82, height: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#D6A054" },
  ornamentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D6A054" },
  aboutText: { maxWidth: 900, fontSize: 14, lineHeight: 22, fontWeight: "400" },
  contactLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  contactLink: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 36,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  contactLinkText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
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
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
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
});
