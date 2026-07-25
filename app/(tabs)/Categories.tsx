import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building2,
  UtensilsCrossed,
  Camera,
  Palette,
  Sparkles,
  Hand,
  Headphones,
  Shirt,
  User,
  Gem,
  BookOpen,
  Mail,
  Music,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import CategoryCard, { type CategoryCardItem } from "@/components/categories/CategoryCard";
import CategoryFilterModal from "@/components/categories/CategoryFilterModal";
import CategoryPageHeader from "@/components/categories/CategoryPageHeader";
import CategorySearchBar from "@/components/categories/CategorySearchBar";
import HomeReveal from "@/components/home/HomeReveal";
import categoryImageUrls from "@/data/categoryImages.cloudinary.json";

function cloudinaryCardImage(url: string) {
  return url.replace("/image/upload/", "/image/upload/f_auto,q_auto,w_720/");
}

const CATEGORIES: CategoryCardItem[] = [
  {
    id: "1",
    name: "Venues",
    description: "Banquets, Lawns, Resorts\n& more",
    icon: Building2,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    image: cloudinaryCardImage(categoryImageUrls["venues.png"]),
    fallbackImage: require("../../assets/images/category-fallback/venues.png"),
  },
  {
    id: "2",
    name: "Caterers",
    description: "Delicious food for every\ncelebration",
    icon: UtensilsCrossed,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    image: cloudinaryCardImage(categoryImageUrls["caterers.png"]),
    fallbackImage: require("../../assets/images/category-fallback/caterers.png"),
  },
  {
    id: "3",
    name: "Photographers",
    description: "Capture your special\nmoments",
    icon: Camera,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    image: cloudinaryCardImage(categoryImageUrls["photographer.png"]),
    fallbackImage: require("../../assets/images/category-fallback/photographer.png"),
  },
  {
    id: "4",
    name: "Decorators",
    description: "Beautiful setups for\nyour events",
    icon: Palette,
    iconColor: "#22C55E",
    iconBg: "#F0FDF4",
    image: cloudinaryCardImage(categoryImageUrls["decoraters.png"]),
    fallbackImage: require("../../assets/images/category-fallback/decoraters.png"),
  },
  {
    id: "5",
    name: "Makeup Artists",
    description: "Look your best on\nyour big day",
    icon: Sparkles,
    iconColor: "#EF4444",
    iconBg: "#FFF1F1",
    image: cloudinaryCardImage(categoryImageUrls["makeup.png"]),
    fallbackImage: require("../../assets/images/category-fallback/makeup.png"),
  },
  {
    id: "6",
    name: "Mehndi Artists",
    description: "Beautiful mehndi for\nyour special day",
    icon: Hand,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    image: cloudinaryCardImage(categoryImageUrls["mehendi artist.png"]),
    fallbackImage: require("../../assets/images/category-fallback/mehendi-artist.png"),
  },
  {
    id: "7",
    name: "DJs",
    description: "Music that makes your\nevent unforgettable",
    icon: Headphones,
    iconColor: "#8B5CF6",
    iconBg: "#F5F3FF",
    image: cloudinaryCardImage(categoryImageUrls["DJ.png"]),
    fallbackImage: require("../../assets/images/category-fallback/DJ.png"),
  },
  {
    id: "8",
    name: "Bridal Wear",
    description: "Exquisite outfits for\nbeautiful brides",
    icon: Shirt,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    image: cloudinaryCardImage(categoryImageUrls["bridal wear.png"]),
    fallbackImage: require("../../assets/images/category-fallback/bridal-wear.png"),
  },
  {
    id: "9",
    name: "Groom Wear",
    description: "Sherwanis, Suits &\nmore",
    icon: User,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    image: cloudinaryCardImage(categoryImageUrls["groom wear.png"]),
    fallbackImage: require("../../assets/images/category-fallback/groom-wear.png"),
  },
  {
    id: "10",
    name: "Jewellery & Accessories",
    description: "Complete your look\nwith perfect jewellery",
    icon: Gem,
    iconColor: "#F59E0B",
    iconBg: "#FFFBEA",
    image: cloudinaryCardImage(categoryImageUrls["jewelwry & accessories.png"]),
    fallbackImage: require("../../assets/images/category-fallback/jewellery-accessories.png"),
  },
  {
    id: "11",
    name: "Pandits",
    description: "Experienced pandits\nfor ceremonies",
    icon: BookOpen,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    image: cloudinaryCardImage(categoryImageUrls["pandits.png"]),
    fallbackImage: require("../../assets/images/category-fallback/pandits.png"),
  },
  {
    id: "12",
    name: "Invites & Cards",
    description: "Unique invitations &\nreturn gifts",
    icon: Mail,
    iconColor: "#8B5CF6",
    iconBg: "#F5F3FF",
    image: cloudinaryCardImage(categoryImageUrls["invite&cards.png"]),
    fallbackImage: require("../../assets/images/category-fallback/invites-cards.png"),
  },
  {
    id: "13",
    name: "Pre Wedding Shoot",
    description: "Capture memories before\nthe big day",
    icon: Camera,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    image: cloudinaryCardImage(categoryImageUrls["pre-wedding shoot.png"]),
    fallbackImage: require("../../assets/images/category-fallback/pre-wedding-shoot.png"),
  },
  {
    id: "14",
    name: "Music & Dance",
    description: "Entertainment for every\nwedding occasion",
    icon: Music,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    image: cloudinaryCardImage(categoryImageUrls["dance.png"]),
    fallbackImage: require("../../assets/images/category-fallback/dance.png"),
  },
];

export default function CategoriesScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const { width } = useWindowDimensions();
  const twoColumns = width >= 900;
  const compactCards = width < 600;
  const contentWidth = Math.min(width - (width >= 1100 ? 48 : 32), 1180);
  const cardWidth = twoColumns ? (contentWidth - 14) / 2 : contentWidth;

  const bg      = isDark ? "#141214" : "#FFFAFC";
  const text    = isDark ? "#F5F0F3" : "#141414";
  const muted   = isDark ? "#AAA0A5" : "#787178";
  const border  = isDark ? "#2A2A2A" : "#F0E8F2";

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return CATEGORIES.filter((category) => {
      const matchesSearch = !normalizedQuery
        || category.name.toLowerCase().includes(normalizedQuery)
        || category.description.toLowerCase().includes(normalizedQuery);
      const matchesCategory = !selectedCategory || category.id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [query, selectedCategory]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: bg }]} edges={["top"]}>
      <View style={[s.topContent, { width: contentWidth }]}>
        <HomeReveal direction="down">
          <CategoryPageHeader
            dark={isDark}
            onBack={() => router.back()}
            onFavorites={() => router.push("/(tabs)/favorites")}
          />
        </HomeReveal>
        <HomeReveal delay={45}>
          <CategorySearchBar
            dark={isDark}
            query={query}
            onChangeQuery={setQuery}
            onOpenFilters={() => setFiltersVisible(true)}
          />
        </HomeReveal>
      </View>

      {/* ── List ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={s.scroll}
        contentContainerStyle={[s.list, { width: contentWidth, paddingBottom: 28 }]}
      >
        <View style={s.grid}>
          {filtered.map((category, index) => (
            <HomeReveal key={category.id} delay={Math.min(index * 32, 224)} style={{ width: cardWidth }}>
              <CategoryCard
                category={category}
                dark={isDark}
                compact={compactCards}
                onPress={() =>
                  router.push({
                    pathname: "/VendorsListing",
                    params: { category: category.name },
                  })
                }
              />
            </HomeReveal>
          ))}
        </View>

        {!filtered.length ? (
          <View style={[s.empty, { borderColor: border }]}>
            <Text style={[s.emptyTitle, { color: text }]}>No categories found</Text>
            <Text style={[s.emptyText, { color: muted }]}>Try another keyword or reset the selected filter.</Text>
          </View>
        ) : null}
      </ScrollView>

      <CategoryFilterModal
        visible={filtersVisible}
        dark={isDark}
        categories={CATEGORIES}
        selected={selectedCategory}
        onClose={() => setFiltersVisible(false)}
        onApply={(category) => {
          setSelectedCategory(category);
          setFiltersVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topContent: { alignSelf: "center", paddingBottom: 15 },
  scroll: { flex: 1 },
  list: { alignSelf: "center" },
  grid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 14 },
  empty: { marginTop: 12, borderWidth: 1, borderStyle: "dashed", borderRadius: 20, paddingVertical: 34, paddingHorizontal: 20, alignItems: "center" },
  emptyTitle: { fontFamily: "serif", fontSize: 20, fontWeight: "700", marginBottom: 5 },
  emptyText: { maxWidth: 330, textAlign: "center", fontSize: 11, lineHeight: 17 },
});
