import { supabase } from "@/services/supabase";
import {
  HERO_SLIDES_MAX,
  type HeroSlide,
  type HeroSlideInput,
  type HeroSlideUpdate,
} from "@/types/hero";

const CACHE_MS = 20_000;
let adminCache: { at: number; rows: HeroSlide[] } | null = null;
let publicCache: { at: number; rows: HeroSlide[] } | null = null;
let channelSequence = 0;

function trimRequired(value: string, label: string) {
  const next = value.trim();
  if (!next) throw new Error(`${label} is required.`);
  return next;
}

function formatHeroError(error: { message?: string; code?: string; details?: string | null }) {
  const message = error.message || "Unable to load hero slides.";
  if (
    error.code === "PGRST205"
    || /Could not find the table .*hero_slides/i.test(message)
    || /relation .*hero_slides.* does not exist/i.test(message)
  ) {
    return "Hero slides table is missing in Supabase. Apply migration 20260805200000_create_hero_slides.sql, then retry.";
  }
  return message;
}

export const HeroSlideService = {
  invalidate() {
    adminCache = null;
    publicCache = null;
  },

  async listAdmin(force = false): Promise<HeroSlide[]> {
    if (!force && adminCache && Date.now() - adminCache.at < CACHE_MS) {
      return adminCache.rows;
    }
    const { data, error } = await supabase
      .from("hero_slides")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(formatHeroError(error));
    const rows = (data ?? []) as HeroSlide[];
    adminCache = { at: Date.now(), rows };
    return rows;
  },

  async listActivePublic(force = false): Promise<HeroSlide[]> {
    if (!force && publicCache && Date.now() - publicCache.at < CACHE_MS) {
      return publicCache.rows;
    }
    const { data, error } = await supabase
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(formatHeroError(error));
    const rows = (data ?? []) as HeroSlide[];
    publicCache = { at: Date.now(), rows };
    return rows;
  },

  async create(input: HeroSlideInput) {
    const existing = await this.listAdmin(true);
    if (existing.length >= HERO_SLIDES_MAX) {
      throw new Error(`Hero Section supports a maximum of ${HERO_SLIDES_MAX} slides.`);
    }

    const categoryName = trimRequired(input.categoryName, "Category");
    const categorySlug = trimRequired(input.categorySlug, "Category slug");
    const ctaLabel = trimRequired(input.ctaLabel, "Button text");
    const imageUrl = trimRequired(input.imageUrl, "Background image");
    if (!input.categoryId?.trim()) throw new Error("Category is required.");

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;

    const desktopImageUrl = input.desktopImageUrl?.trim() || null;

    const { data, error } = await supabase
      .from("hero_slides")
      .insert({
        image_url: imageUrl,
        image_public_id: input.imagePublicId ?? null,
        desktop_image_url: desktopImageUrl,
        desktop_image_public_id: desktopImageUrl
          ? (input.desktopImagePublicId ?? null)
          : null,
        category_id: input.categoryId,
        category_slug: categorySlug,
        category_name: categoryName,
        cta_label: ctaLabel,
        is_active: input.isActive ?? true,
        display_order: input.displayOrder
          ?? ((existing[existing.length - 1]?.display_order ?? -10) + 10),
        created_by: userId,
        updated_by: userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(formatHeroError(error));
    this.invalidate();
    return data as HeroSlide;
  },

  async update(id: string, input: HeroSlideUpdate) {
    const payload: Record<string, unknown> = {};
    if (input.imageUrl !== undefined) {
      payload.image_url = trimRequired(input.imageUrl, "Background image");
    }
    if (input.imagePublicId !== undefined) payload.image_public_id = input.imagePublicId;
    if (input.desktopImageUrl !== undefined) {
      const desktopImageUrl = input.desktopImageUrl?.trim() || null;
      payload.desktop_image_url = desktopImageUrl;
      if (!desktopImageUrl) payload.desktop_image_public_id = null;
    }
    if (input.desktopImagePublicId !== undefined) {
      payload.desktop_image_public_id = input.desktopImagePublicId;
    }
    if (input.categoryId !== undefined) {
      if (!input.categoryId.trim()) throw new Error("Category is required.");
      payload.category_id = input.categoryId;
    }
    if (input.categorySlug !== undefined) {
      payload.category_slug = trimRequired(input.categorySlug, "Category slug");
    }
    if (input.categoryName !== undefined) {
      payload.category_name = trimRequired(input.categoryName, "Category");
    }
    if (input.ctaLabel !== undefined) {
      payload.cta_label = trimRequired(input.ctaLabel, "Button text");
    }
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;

    const { data: authData } = await supabase.auth.getUser();
    payload.updated_by = authData.user?.id ?? null;

    const { data, error } = await supabase
      .from("hero_slides")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(formatHeroError(error));
    this.invalidate();
    return data as HeroSlide;
  },

  async setActive(id: string, isActive: boolean) {
    return this.update(id, { isActive });
  },

  async reorder(orderedIds: string[]) {
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        supabase.from("hero_slides").update({ display_order: index * 10 }).eq("id", id),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(formatHeroError(failed.error));
    this.invalidate();
  },

  async remove(id: string) {
    const { error } = await supabase.from("hero_slides").delete().eq("id", id);
    if (error) throw new Error(formatHeroError(error));
    this.invalidate();
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`hero-slides-${channelSequence}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "hero_slides" },
      onChange,
    );
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
