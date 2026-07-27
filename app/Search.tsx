import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronRight, Search as SearchIcon } from "lucide-react-native";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import { useColorScheme } from "nativewind";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import {
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";

const GLOBAL_PAGES = [
  { label: "Categories", detail: "Browse every wedding service", keywords: "categories services vendors browse", route: "/(tabs)/Categories" as const },
  { label: "Favorites", detail: "Open your saved vendors", keywords: "favorites saved wishlist shortlist heart", route: "/(tabs)/favorites" as const },
  { label: "Profile", detail: "Manage your RoyalLagn account", keywords: "profile account settings edit personal", route: "/(tabs)/profile" as const },
  { label: "Help & Support", detail: "Get help using RoyalLagn", keywords: "help support contact assistance faq", route: "/Help" as const },
  { label: "About RoyalLagn", detail: "Learn more about the platform", keywords: "about royallagn company information", route: "/About" as const },
  { label: "Privacy Policy", detail: "Review privacy information", keywords: "privacy policy data security", route: "/PrivacyPolicy" as const },
  { label: "Terms & Conditions", detail: "Review application terms", keywords: "terms conditions legal policy", route: "/Terms" as const },
  { label: "Become a Vendor", detail: "List your wedding business", keywords: "become vendor register business list", route: "/BecomeVendor" as const },
];

function matchesKeyword(haystack: string, keyword: string) {
  const tokens = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const normalized = haystack.toLowerCase();
  return tokens.every((token) => normalized.includes(token));
}

export default function SearchScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const { getRating } = useReviewRatings();
  const params = useLocalSearchParams<{
    query?: string;
    location?: string;
    rating?: string;
    budget?: string;
    category?: string;
    nearby?: string;
    availability?: string;
    sort?: string;
  }>();
  const initialQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [vendors, setVendors] = useState<PublicVendorListing[]>([]);

  useEffect(() => {
    const nextQuery = Array.isArray(params.query) ? params.query[0] : params.query ?? "";
    setDraftQuery(nextQuery);
    setQuery(nextQuery);
  }, [params.query]);

  useEffect(() => {
    let active = true;
    const load = () => {
      getApprovedPublicVendors()
        .then((items) => {
          if (active) setVendors(items);
        })
        .catch(() => {
          if (active) setVendors([]);
        });
    };
    load();
    const unsubscribe = subscribeToPublicVendorChanges(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const selectedLocation = Array.isArray(params.location) ? params.location[0] : params.location ?? "";
  const minimumRating = Number(Array.isArray(params.rating) ? params.rating[0] : params.rating) || 0;
  const maximumBudget = Number(Array.isArray(params.budget) ? params.budget[0] : params.budget) || 0;
  const selectedCategory = Array.isArray(params.category) ? params.category[0] : params.category ?? "";
  const nearbyOnly = (Array.isArray(params.nearby) ? params.nearby[0] : params.nearby) === "true";
  const availabilityOnly = (Array.isArray(params.availability) ? params.availability[0] : params.availability) === "true";
  const sort = Array.isArray(params.sort) ? params.sort[0] : params.sort ?? "recommended";

  const results = useMemo(() => {
    const ratedVendors = vendors.map((vendor) => {
      const current = getRating(vendor.id, vendor.rating, vendor.reviews);
      return { ...vendor, rating: current.rating, reviews: current.reviews };
    });
    const filtered = ratedVendors.filter((vendor) => {
      const searchable = [
        vendor.name,
        vendor.category,
        vendor.location,
        vendor.tags.join(" "),
        vendor.services.join(" "),
        vendor.description,
      ].join(" ");
      return matchesKeyword(searchable, query)
        && (!selectedCategory || vendor.category === selectedCategory)
        && (!minimumRating || vendor.rating >= minimumRating)
        && (!maximumBudget || (
          vendor.startingPriceValue > 0
          && vendor.startingPriceValue <= maximumBudget
        ))
        && (!availabilityOnly || vendor.isAvailable)
        && (!nearbyOnly || vendor.location.toLowerCase().includes(selectedLocation.toLowerCase()));
    });

    return [...filtered].sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
      if (sort === "price") {
        return (a.startingPriceValue || Number.MAX_SAFE_INTEGER)
          - (b.startingPriceValue || Number.MAX_SAFE_INTEGER);
      }
      const aLocal = selectedLocation && a.location.toLowerCase().includes(selectedLocation.toLowerCase()) ? 1 : 0;
      const bLocal = selectedLocation && b.location.toLowerCase().includes(selectedLocation.toLowerCase()) ? 1 : 0;
      return bLocal - aLocal || b.rating - a.rating || b.reviews - a.reviews;
    });
  }, [availabilityOnly, getRating, maximumBudget, minimumRating, nearbyOnly, query, selectedCategory, selectedLocation, sort, vendors]);

  const pageResults = useMemo(() => {
    if (!query.trim()) return { fixedPages: [], categoryPages: [] };
    const fixedPages = GLOBAL_PAGES.filter((page) => matchesKeyword(`${page.label} ${page.detail} ${page.keywords}`, query));
    const categoryPages = [...new Set(vendors.map((vendor) => vendor.category))]
      .filter((category) => matchesKeyword(`${category} wedding vendors services`, query))
      .slice(0, 5)
      .map((category) => ({ label: category, detail: `Browse ${category.toLowerCase()}`, category }));
    return { fixedPages, categoryPages };
  }, [query, vendors]);

  const submit = () => setQuery(draftQuery.trim());
  const activeFilterCount = [minimumRating > 0, maximumBudget > 0, Boolean(selectedCategory), availabilityOnly, nearbyOnly, sort !== "recommended"].filter(Boolean).length;
  const horizontalInset = width < 380 ? 14 : width < 600 ? 16 : 24;
  const contentWidth = Math.min(width - horizontalInset * 2, 980);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View style={[styles.searchHeader, { width: contentWidth }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-10 h-10 rounded-full bg-muted items-center justify-center"
          onPress={goBack}
        >
          <ArrowLeft size={20} className="text-foreground" />
        </TouchableOpacity>
        <CompactSearchBar
          accessibilityLabel="Search vendors, categories and services"
          value={draftQuery}
          onChangeText={(value) => {
            setDraftQuery(value);
            if (!value) setQuery("");
          }}
          onSubmit={submit}
          placeholder="Search vendors, categories, services…"
          dark={isDark}
          style={styles.search}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.results, { width: contentWidth }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">{results.length} vendor results</Text>
          {activeFilterCount ? <Text className="text-primary text-xs font-semibold">{activeFilterCount} filters active</Text> : null}
        </View>

        {pageResults.fixedPages.length || pageResults.categoryPages.length ? (
          <View className="bg-card border border-border rounded-2xl p-2">
            <Text className="text-foreground text-sm font-bold px-2 pt-1 pb-2">Pages & categories</Text>
            {pageResults.fixedPages.map((page) => (
              <TouchableOpacity key={page.label} onPress={() => router.push(page.route)} className="min-h-[52px] px-2 flex-row items-center border-t border-border">
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{page.label}</Text>
                  <Text className="text-muted-foreground text-2xs mt-0.5">{page.detail}</Text>
                </View>
                <ChevronRight size={16} className="text-primary" />
              </TouchableOpacity>
            ))}
            {pageResults.categoryPages.map((page) => (
              <TouchableOpacity key={page.category} onPress={() => router.push({ pathname: "/VendorsListing", params: { category: page.category } })} className="min-h-[52px] px-2 flex-row items-center border-t border-border">
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{page.label}</Text>
                  <Text className="text-muted-foreground text-2xs mt-0.5">{page.detail}</Text>
                </View>
                <ChevronRight size={16} className="text-primary" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {results.map((vendor) => (
          <TouchableOpacity
            key={`${vendor.category}-${vendor.id}`}
            className="bg-card border border-border rounded-2xl p-3 flex-row"
            onPress={() => router.push({ pathname: "/VendorsProfile", params: { vendorId: vendor.id, category: vendor.category } })}
          >
            <Image source={{ uri: vendor.image }} className="w-20 h-20 rounded-xl" resizeMode="cover" />
            <View className="ml-3 flex-1 justify-center">
              <Text className="text-foreground font-semibold">{vendor.name}</Text>
              <Text className="text-primary text-xs mt-1">{vendor.category} · {vendor.rating} ★</Text>
              <Text className="text-muted-foreground text-xs mt-1">{vendor.location} · {vendor.startingPrice}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {!results.length ? (
          <View className="min-h-[180px] bg-card border border-border rounded-2xl items-center justify-center px-6">
            <SearchIcon size={26} className="text-primary" />
            <Text className="text-foreground font-bold mt-3">No vendor matches found</Text>
            <Text className="text-muted-foreground text-xs text-center mt-1">Try a broader keyword or reset filters from Home.</Text>
          </View>
        ) : null}
      </ScrollView>

      <StandaloneMobileTabBar activeRoute="index" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchHeader: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingBottom: 10,
  },
  search: {
    flex: 1,
    minWidth: 0,
    height: 46,
  },
  scroll: { flex: 1 },
  results: {
    alignSelf: "center",
    paddingTop: 6,
    paddingBottom: 28,
    gap: 12,
  },
});
