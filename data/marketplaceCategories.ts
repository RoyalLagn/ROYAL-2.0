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
  cloudinaryImage: string;
  fallbackImage: number | ImageURISource;
  homeImage: ImageSourcePropType;
};

function cloudinaryCardImage(url: string) {
  return url.replace("/image/upload/", "/image/upload/f_auto,q_auto,w_720/");
}

export const MARKETPLACE_CATEGORIES: readonly MarketplaceCategory[] = [
  {
    slug: "venues",
    name: "Venues",
    aliases: ["venue", "wedding hall", "wedding halls"],
    description: "Banquets, lawns, resorts and more",
    icon: Building2,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["venues.png"]),
    fallbackImage: require("../assets/images/category-fallback/venues.png"),
    homeImage: require("../assets/images/category-icons-v3/venues.png"),
  },
  {
    slug: "caterers",
    name: "Caterers",
    aliases: ["caterer", "catering"],
    description: "Delicious food for every celebration",
    icon: UtensilsCrossed,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["caterers.png"]),
    fallbackImage: require("../assets/images/category-fallback/caterers.png"),
    homeImage: require("../assets/images/category-icons-v3/caterers.png"),
  },
  {
    slug: "photographers",
    name: "Photographers",
    aliases: ["photographer", "photography"],
    description: "Capture your most special moments",
    icon: Camera,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["photographer.png"]),
    fallbackImage: require("../assets/images/category-fallback/photographer.png"),
    homeImage: require("../assets/images/category-icons-v3/photographers.png"),
  },
  {
    slug: "decorators",
    name: "Decorators",
    aliases: ["decorator", "decor"],
    description: "Beautiful setups for your celebrations",
    icon: Palette,
    iconColor: "#22C55E",
    iconBg: "#F0FDF4",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["decoraters.png"]),
    fallbackImage: require("../assets/images/category-fallback/decoraters.png"),
    homeImage: require("../assets/images/category-icons-v3/decorators.png"),
  },
  {
    slug: "makeup-artists",
    name: "Makeup Artists",
    aliases: ["makeup artist", "make-up artist", "makeup"],
    description: "Look your best on your big day",
    icon: Sparkles,
    iconColor: "#EF4444",
    iconBg: "#FFF1F1",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["makeup.png"]),
    fallbackImage: require("../assets/images/category-fallback/makeup.png"),
    homeImage: require("../assets/images/category-icons-v3/makeup-artists.png"),
  },
  {
    slug: "mehndi-artists",
    name: "Mehndi Artists",
    aliases: ["mehndi artist", "mehendi artist", "mehandi artist", "mehendi artists", "mehandi artists"],
    description: "Beautiful mehndi for your special day",
    icon: Hand,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["mehendi artist.png"]),
    fallbackImage: require("../assets/images/category-fallback/mehendi-artist.png"),
    homeImage: require("../assets/images/category-icons-v3/mehndi-artists.png"),
  },
  {
    slug: "djs",
    name: "DJs",
    aliases: ["dj", "disc jockey", "disc jockeys"],
    description: "Music that makes your event unforgettable",
    icon: Headphones,
    iconColor: "#8B5CF6",
    iconBg: "#F5F3FF",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["DJ.png"]),
    fallbackImage: require("../assets/images/category-fallback/DJ.png"),
    homeImage: require("../assets/images/category-icons-v3/djs.png"),
  },
  {
    slug: "bridal-wear",
    name: "Bridal Wear",
    aliases: ["bridalwear", "bridal outfit", "bridal outfits"],
    description: "Exquisite outfits for beautiful brides",
    icon: Shirt,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["bridal wear.png"]),
    fallbackImage: require("../assets/images/category-fallback/bridal-wear.png"),
    homeImage: require("../assets/images/category-icons-v3/bridal-wear.png"),
  },
  {
    slug: "groom-wear",
    name: "Groom Wear",
    aliases: ["groomwear", "groom outfit", "groom outfits"],
    description: "Sherwanis, suits and more",
    icon: User,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["groom wear.png"]),
    fallbackImage: require("../assets/images/category-fallback/groom-wear.png"),
    homeImage: require("../assets/images/category-icons-v3/groom-wear.png"),
  },
  {
    slug: "jewellery-accessories",
    name: "Jewellery & Accessories",
    aliases: ["jewellery", "jewelry", "jewellery and accessories", "jewelry and accessories"],
    description: "Complete your look with perfect jewellery",
    icon: Gem,
    iconColor: "#F59E0B",
    iconBg: "#FFFBEA",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["jewelwry & accessories.png"]),
    fallbackImage: require("../assets/images/category-fallback/jewellery-accessories.png"),
    homeImage: require("../assets/images/category-icons-v3/jewellery-accessories.png"),
  },
  {
    slug: "pandits",
    name: "Pandits",
    aliases: ["pandit", "priest", "priests"],
    description: "Experienced pandits for wedding ceremonies",
    icon: BookOpen,
    iconColor: "#F97316",
    iconBg: "#FFF3EA",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["pandits.png"]),
    fallbackImage: require("../assets/images/category-fallback/pandits.png"),
    homeImage: require("../assets/images/category-icons-v3/pandits.png"),
  },
  {
    slug: "invites-cards",
    name: "Invites & Cards",
    aliases: ["invites", "invitation cards", "invites and cards", "wedding invitations"],
    description: "Beautiful invitations for every celebration",
    icon: Mail,
    iconColor: "#8B5CF6",
    iconBg: "#F5F3FF",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["invite&cards.png"]),
    fallbackImage: require("../assets/images/category-fallback/invites-cards.png"),
    homeImage: require("../assets/images/category-icons-v3/invites-cards.png"),
  },
  {
    slug: "pre-wedding-shoot",
    name: "Pre Wedding Shoot",
    aliases: ["pre-wedding shoot", "pre wedding shoots", "pre-wedding shoots"],
    description: "Capture memories before the big day",
    icon: Camera,
    iconColor: "#3B82F6",
    iconBg: "#EFF6FF",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["pre-wedding shoot.png"]),
    fallbackImage: require("../assets/images/category-fallback/pre-wedding-shoot.png"),
    homeImage: require("../assets/images/category-icons-v3/pre-wedding-shoot.png"),
  },
  {
    slug: "music-dance",
    name: "Music & Dance",
    aliases: ["music and dance", "dance and choreography", "dance & choreography", "choreographer", "choreographers"],
    description: "Music and entertainment for every occasion",
    icon: Music,
    iconColor: "#EC4899",
    iconBg: "#FFF0F7",
    cloudinaryImage: cloudinaryCardImage(categoryImageUrls["dance.png"]),
    fallbackImage: require("../assets/images/category-fallback/dance.png"),
    homeImage: require("../assets/images/category-icons-v3/dance-choreography.png"),
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
