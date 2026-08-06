export type HeroSlide = {
  id: string;
  image_url: string;
  image_public_id: string | null;
  /** Optional wide desktop/web banner. Falls back to image_url when null. */
  desktop_image_url: string | null;
  desktop_image_public_id: string | null;
  category_id: string;
  category_slug: string;
  category_name: string;
  cta_label: string;
  is_active: boolean;
  display_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HeroSlideInput = {
  imageUrl: string;
  imagePublicId?: string | null;
  desktopImageUrl?: string | null;
  desktopImagePublicId?: string | null;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  ctaLabel: string;
  isActive?: boolean;
  displayOrder?: number;
};

export type HeroSlideUpdate = Partial<HeroSlideInput>;

export const HERO_SLIDES_MAX = 8;

/** Desktop/web hero banner aspect (width:height ≈ 16:6). */
export const HERO_DESKTOP_ASPECT = 16 / 6;

/** Recommended hero upload aspect (width:height = 16:9). */
export const HERO_IMAGE_ASPECT = 16 / 9;

/**
 * Mobile hero shell aspect (width:height = 15:8). The home carousel shell may
 * use this; admin preview always uses HERO_IMAGE_ASPECT so uploads are not stretched.
 */
export const HERO_MOBILE_ASPECT = 15 / 8;

/**
 * Destination for a hero slide's CTA button, derived from the category slug
 * rather than a hand-entered URL. Works the same on web, Android and iOS
 * because expo-router resolves the pathname on every platform.
 */
export function heroSlideDestination(slide: Pick<HeroSlide, "category_slug" | "category_name">) {
  return {
    pathname: "/VendorsListing" as const,
    params: { category: slide.category_slug || slide.category_name },
  };
}

/** Resolve which image URL to show. One hero image is used on every layout. */
export function heroSlideImageUrl(
  slide: Pick<HeroSlide, "image_url" | "desktop_image_url">,
  _desktop?: boolean,
) {
  return slide.image_url;
}
