import type { ImageSourcePropType, ImageURISource } from "react-native";
import {
  BookOpen,
  Building2,
  Camera,
  Gem,
  Hand,
  Headphones,
  Mail,
  Music,
  Palette,
  Shirt,
  Sparkles,
  User,
  UtensilsCrossed,
} from "lucide-react-native";
import categoryImageUrls from "@/data/categoryImages.cloudinary.json";

export type MarketplaceCategory = {
  slug: string;
  name: string;
  aliases: readonly string[];
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  cardImage: string;
  fallbackImage: number | ImageURISource;
  homeImage: ImageSourcePropType;
};

export const MARKETPLACE_CATEGORIES: readonly MarketplaceCategory[] = [
  {
    slug: "venues",
    name: "Venues",
    aliases: ["venue", "wedding hall", "wedding halls"],
    description: "Banquets, lawns, resorts and more",
    icon: Building2,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    cardImage: categoryImageUrls["venues.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-venue.webp"),
  },
  {
    slug: "caterers",
    name: "Caterers",
    aliases: ["caterer", "catering"],
    description: "Delicious food for every celebration",
    icon: UtensilsCrossed,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    cardImage: categoryImageUrls["caterers.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-caterer.webp"),
  },
  {
    slug: "photographers",
    name: "Photographers",
    aliases: ["photographer", "photography"],
    description: "Capture your most special moments",
    icon: Camera,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    cardImage: categoryImageUrls["photographers.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-photographer.webp"),
  },
  {
    slug: "decorators",
    name: "Decorators",
    aliases: ["decorator", "decor"],
    description: "Beautiful setups for your celebrations",
    icon: Palette,
    iconColor: "#22C55E",
    iconBg: "#F0FDF4",
    cardImage: categoryImageUrls["decorators.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-decorator.webp"),
  },
  {
    slug: "makeup-artists",
    name: "Makeup Artists",
    aliases: ["makeup artist", "make-up artist", "makeup"],
    description: "Look your best on your big day",
    icon: Sparkles,
    iconColor: "#EF4444",
    iconBg: "#FFF1F1",
    cardImage: categoryImageUrls["makeup-artists.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-makeup.webp"),
  },
  {
    slug: "mehndi-artists",
    name: "Mehndi Artists",
    aliases: ["mehndi artist", "mehendi artist", "mehandi artist", "mehendi artists", "mehandi artists"],
    description: "Beautiful mehndi for your special day",
    icon: Hand,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    cardImage: categoryImageUrls["mehndi-artists.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-mehndi.webp"),
  },
  {
    slug: "djs",
    name: "DJs",
    aliases: ["dj", "disc jockey", "disc jockeys"],
    description: "Music that makes your event unforgettable",
    icon: Headphones,
    iconColor: "#8B5CF6",
    iconBg: "#F5F3FF",
    cardImage: categoryImageUrls["dj.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-dj.webp"),
  },
  {
    slug: "bridal-wear",
    name: "Bridal Wear",
    aliases: ["bridalwear", "bridal outfit", "bridal outfits"],
    description: "Exquisite outfits for beautiful brides",
    icon: Shirt,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    cardImage: categoryImageUrls["bridal-wear.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-bride-outfit.webp"),
  },
  {
    slug: "groom-wear",
    name: "Groom Wear",
    aliases: ["groomwear", "groom outfit", "groom outfits"],
    description: "Sherwanis, suits and more",
    icon: User,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    cardImage: categoryImageUrls["groom-wear.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-groom-outfit.webp"),
  },
  {
    slug: "jewellery-accessories",
    name: "Jewellery & Accessories",
    aliases: ["jewellery", "jewelry", "jewellery and accessories", "jewelry and accessories"],
    description: "Complete your look with perfect jewellery",
    icon: Gem,
    iconColor: "#F59E0B",
    iconBg: "#FFFBEA",
    cardImage: categoryImageUrls["jewellery-accessories.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-jewellery.webp"),
  },
  {
    slug: "pandits",
    name: "Pandits",
    aliases: ["pandit", "priest", "priests"],
    description: "Experienced pandits for wedding ceremonies",
    icon: BookOpen,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    cardImage: categoryImageUrls["pandits.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-pandit.webp"),
  },
  {
    slug: "invites-cards",
    name: "Invites & Cards",
    aliases: ["invites", "invitation cards", "invites and cards", "wedding invitations"],
    description: "Beautiful invitations for every celebration",
    icon: Mail,
    iconColor: "#8B5CF6",
    iconBg: "#F5F3FF",
    cardImage: categoryImageUrls["invites-cards.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-invitation-cards.webp"),
  },
  {
    slug: "pre-wedding-shoot",
    name: "Pre Wedding Shoot",
    aliases: ["pre-wedding shoot", "pre wedding shoots", "pre-wedding shoots"],
    description: "Capture memories before the big day",
    icon: Camera,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    cardImage: categoryImageUrls["pre-wedding-shoot.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-pre-wedding.webp"),
  },
  {
    slug: "music-dance",
    name: "Music & Dance",
    aliases: ["music and dance", "dance and choreography", "dance & choreography", "choreographer", "choreographers"],
    description: "Music and entertainment for every occasion",
    icon: Music,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    cardImage: categoryImageUrls["dance-choreography.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-dance.webp"),
  },
  {
    slug: "live-orchestra-band",
    name: "Live Orchestra & Band",
    aliases: ["live orchestra", "orchestra", "orchestra and band", "wedding band", "wedding bands", "live band"],
    description: "Live music and wedding bands for every celebration",
    icon: Music,
    iconColor: "#E91E63",
    iconBg: "#FFF0F6",
    cardImage: categoryImageUrls["wedding-bands.png"],
    fallbackImage: require("../assets/images/optimized/vendor-placeholder.webp"),
    homeImage: require("../assets/images/optimized/cat-live-orchestra-band.webp"),
  },
] as const;

function normalizeCategoryKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findMarketplaceCategory(value: string) {
  const candidate = normalizeCategoryKey(value);
  return MARKETPLACE_CATEGORIES.find((category) =>
    normalizeCategoryKey(category.name) === candidate
    || normalizeCategoryKey(category.slug) === candidate
    || category.aliases.some((alias) => normalizeCategoryKey(alias) === candidate)
  );
}

export function resolveMarketplaceCategoryImage(
  value: MarketplaceCategory | string,
) {
  const category = typeof value === "string"
    ? findMarketplaceCategory(value)
    : value;
  const fallbackCategory = category ?? MARKETPLACE_CATEGORIES[0];
  return {
    source: category?.cardImage ?? "",
    fallbackSource: fallbackCategory.fallbackImage,
  };
}
