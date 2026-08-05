export type HeroSlide = {
  id: string;
  image_url: string;
  image_public_id: string | null;
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
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  ctaLabel: string;
  isActive?: boolean;
  displayOrder?: number;
};

export type HeroSlideUpdate = Partial<HeroSlideInput>;

export const HERO_SLIDES_MAX = 8;

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
