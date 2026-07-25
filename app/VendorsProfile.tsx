import React, { useMemo, useState } from "react";
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
import { categoryProfiles, getVendorById } from "@/data/vendorData";
import { useFavorites } from "@/context/FavoritesContext";
import PackagesCard from "@/components/vendor-profile/PackagesCard";
import PortfolioGallery, { type PortfolioItem } from "@/components/vendor-profile/PortfolioGallery";
import ServiceChips from "@/components/vendor-profile/ServiceChips";
import StickyQuoteBar, { STICKY_QUOTE_BAR_MIN_HEIGHT } from "@/components/vendor-profile/StickyQuoteBar";
import VendorHeroCarousel from "@/components/vendor-profile/VendorHeroCarousel";
import VendorInfoPanel from "@/components/vendor-profile/VendorInfoPanel";
import VendorQuickActions from "@/components/vendor-profile/VendorQuickActions";
import ConnectedVendorReviews from "@/components/reviews/ConnectedVendorReviews";
import { useReviewRatings } from "@/context/ReviewRatingsContext";

const PINK = "#E91E63";
const CONTACT_NUMBER = "+919876543210";
const CATEGORY_FALLBACKS: Record<string, number> = {
  Venues: require("../assets/images/category-fallback/venues.png"),
  Caterers: require("../assets/images/category-fallback/caterers.png"),
  Photographers: require("../assets/images/category-fallback/photographer.png"),
  Decorators: require("../assets/images/category-fallback/decoraters.png"),
  "Makeup Artists": require("../assets/images/category-fallback/makeup.png"),
  "Mehndi Artists": require("../assets/images/category-fallback/mehendi-artist.png"),
  DJs: require("../assets/images/category-fallback/DJ.png"),
  "Bridal Wear": require("../assets/images/category-fallback/bridal-wear.png"),
  "Groom Wear": require("../assets/images/category-fallback/groom-wear.png"),
  "Jewellery & Accessories": require("../assets/images/category-fallback/jewellery-accessories.png"),
  Pandits: require("../assets/images/category-fallback/pandits.png"),
  "Invites & Cards": require("../assets/images/category-fallback/invites-cards.png"),
  "Pre Wedding Shoot": require("../assets/images/category-fallback/pre-wedding-shoot.png"),
  "Music & Dance": require("../assets/images/category-fallback/dance.png"),
};

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
  const dark = colorScheme === "dark";
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ vendorId?: string; category?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const paramCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const result = vendorId ? getVendorById(vendorId) : null;
  const vendor = result?.vendor;
  const category = result?.category ?? paramCategory ?? "Photographers";
  const profile = categoryProfiles[category] ?? categoryProfiles.Photographers;
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getRating } = useReviewRatings();
  const [expanded, setExpanded] = useState(false);

  const background = dark ? "#151315" : "#FFF9FB";
  const surface = dark ? "#1E1C1D" : "#FFFFFF";
  const text = dark ? "#F8F1F4" : "#261A20";
  const muted = dark ? "#B8ABB1" : "#71666C";
  const contentWidth = Math.min(width, 1120);

  const portfolioItems = useMemo<PortfolioItem[]>(
    () => vendor
      ? [vendor.image, ...profile.portfolioImages].map((image, index) => ({
          id: `${vendor.id}-${index}`,
          image: enhanceImage(image),
          alt: `${vendor.name} portfolio image ${index + 1}`,
        }))
      : [],
    [profile.portfolioImages, vendor],
  );
  const heroImages = useMemo(
    () => vendor
      ? [vendor.image, ...profile.portfolioImages].map((image) => ({ uri: enhanceImage(image) }))
      : [],
    [profile.portfolioImages, vendor],
  );

  if (!vendor) {
    return (
      <View style={[styles.notFound, { backgroundColor: background }]}>
        <Text style={[styles.notFoundTitle, { color: text }]}>Vendor not found</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.goBack}>
          <Text style={styles.goBackText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const favorite = isFavorite(vendor.id);
  const displayedRating = getRating(vendor.id, vendor.rating, vendor.reviews);
  const fallbackImage = CATEGORY_FALLBACKS[category] ?? CATEGORY_FALLBACKS.Photographers;
  const about = profile.about(vendor.name);
  const aboutCopy = expanded || about.length <= 180 ? about : `${about.slice(0, 177).trim()}…`;
  const placeholder = (title: string) =>
    Alert.alert(title, `${title} is available as a local frontend placeholder.`);

  const toggleVendorFavorite = () => toggleFavorite({
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
  });

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: STICKY_QUOTE_BAR_MIN_HEIGHT + 52 }}
      >
        <View style={[styles.page, { width: contentWidth, backgroundColor: surface }]}>
          <VendorHeroCarousel
            images={heroImages}
            fallbackImage={fallbackImage}
            vendorName={vendor.name}
            onBack={() => router.back()}
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
              onCall={() => Linking.openURL(`tel:${CONTACT_NUMBER}`)}
              onWhatsApp={() => Linking.openURL(`https://wa.me/${CONTACT_NUMBER.replace("+", "")}`)}
              onEnquire={() => placeholder("Send Enquiry")}
            />
          </VendorInfoPanel>

          <View style={styles.content}>
            <PackagesCard
              price={vendor.startingPrice}
              dark={dark}
              onPress={() => placeholder("Packages")}
            />

            <View style={styles.section}>
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

            <View style={styles.section}>
              <SectionHeading dark={dark}>Services</SectionHeading>
              <ServiceChips services={profile.services} dark={dark} />
            </View>

            <View style={styles.portfolioSection}>
              <PortfolioGallery
                items={portfolioItems}
                dark={dark}
                fallbackImage={fallbackImage}
                onViewAll={() => placeholder("Portfolio")}
                onOpenItem={(_item, index) =>
                  Alert.alert("Portfolio Photo", `Photo ${index + 1} of ${portfolioItems.length}`)
                }
              />
            </View>

            <View style={styles.reviewsSection}>
              <ConnectedVendorReviews vendorKey={vendor.id} dark={dark} />
            </View>
          </View>
        </View>
      </ScrollView>

      <StickyQuoteBar
        price={vendor.startingPrice}
        priceLabel="Starting from"
        dark={dark}
        onRequestQuote={() => placeholder("Request Quote")}
      />
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: {
    maxWidth: "100%",
    alignSelf: "center",
    overflow: "hidden",
    shadowColor: "#8D5368",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  section: { marginTop: 30 },
  portfolioSection: { marginTop: 27, marginBottom: 12 },
  reviewsSection: { marginTop: 30, marginBottom: 18 },
  sectionHeadingWrap: { alignSelf: "flex-start", marginBottom: 12 },
  sectionHeading: {
    fontFamily: serif,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: -0.25,
  },
  ornament: { width: 82, height: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#D6A054" },
  ornamentDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D6A054" },
  aboutText: { maxWidth: 900, fontSize: 14, lineHeight: 23 },
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
  readMoreText: { color: PINK, fontFamily: serif, fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.7 },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  notFoundTitle: { fontFamily: serif, fontSize: 23, fontWeight: "700" },
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
