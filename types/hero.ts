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

/**
 * Mobile hero aspect (width:height = 15:8). The shell is locked to this on phones,
 * so the slide image fills it with `cover` and needs no blurred backing layer.
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

/** Resolve which image URL to show for the current layout. */
export function heroSlideImageUrl(
  slide: Pick<HeroSlide, "image_url" | "desktop_image_url">,
  desktop: boolean,
) {
  if (desktop) {
    const desktopUrl = slide.desktop_image_url?.trim();
    if (desktopUrl) return desktopUrl;
  }
  return slide.image_url;
}
