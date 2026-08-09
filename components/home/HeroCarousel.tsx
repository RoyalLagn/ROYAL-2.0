import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View, } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import HeroSlideMedia, { heroDeliveryUrl } from "@/components/home/HeroSlideMedia";
import { HeroSlideService } from "@/services/heroSlides";
import {
  HERO_IMAGE_ASPECT, heroSlideDestination, heroSlideImageUrl, } from "@/types/hero";
import { brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale } from "@/constants/typography";

/** Darker brand pink for small CTA text (WCAG AA on white text). */
const PINK = brandPalette.light.primaryStrong;

type HeroSlideView = {
  id: string;
  imageUri: string;
  ctaLabel: string;
  categorySlug: string;
  categoryName: string;
};

type HeroCarouselProps = {
  width: number;
  desktop: boolean;
  /** Overrides the shell's own corner radius — pass 0 when an outer container already clips it. */
  radius?: number;
};

/**
 * Homepage hero carousel.
 * Shell is always a true 16:9 box driven by `width`. Media uses contain so the
 * full creative stays visible. Pink CTA button is restored on each slide.
 */
export default function HeroCarousel({ width, desktop, radius: radiusOverride }: HeroCarouselProps) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interacting = useRef(false);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heroSlides, setHeroSlides] = useState<HeroSlideView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pressedControl, setPressedControl] = useState<string | null>(null);
  const [hoveredCta, setHoveredCta] = useState<string | null>(null);
  const slides = useMemo(
    () => (heroSlides.length ? [...heroSlides, heroSlides[0]] : []),
    [heroSlides],
  );
  const narrow = !desktop && width < 340;
  const radius = radiusOverride ?? (desktop ? 26 : 22);

  useEffect(() => {
    let active = true;

    const mapRows = async (force = false) => {
      try {
        const rows = await HeroSlideService.listActivePublic(force);
        if (!active) return;
        setLoadError(null);
        // Transform at map-time so every consumer (Image, preload) gets a sized URL.
        const displayWidth = Math.max(320, width || (desktop ? 960 : 390));
        setHeroSlides(
          rows.map((row) => ({
            id: row.id,
            imageUri: heroDeliveryUrl(heroSlideImageUrl(row, desktop), displayWidth),
            ctaLabel: row.cta_label,
            categorySlug: row.category_slug,
            categoryName: row.category_name,
          })),
        );
      } catch (reason) {
        if (!active) return;
        setHeroSlides([]);
        setLoadError(reason instanceof Error ? reason.message : "Unable to load hero slides.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void mapRows();
    const unsubscribe = HeroSlideService.subscribe(() => {
      void mapRows(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktop, width]);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [heroSlides]);

  const finishInteractionLater = useCallback(() => {
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    interactionTimer.current = setTimeout(() => {
      interacting.current = false;
    }, 1400);
  }, []);

  const goTo = useCallback((index: number, animated = true) => {
    if (!heroSlides.length) return;
    const target = index < 0 ? heroSlides.length - 1 : index;
    scrollRef.current?.scrollTo({ x: target * width, y: 0, animated });
    if (target < heroSlides.length) {
      activeIndexRef.current = target;
      setActiveIndex(target);
    } else {
      if (loopResetTimer.current) clearTimeout(loopResetTimer.current);
      loopResetTimer.current = setTimeout(() => {
        activeIndexRef.current = 0;
        setActiveIndex(0);
        scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      }, 750);
    }
  }, [heroSlides.length, width]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndexRef.current * width, y: 0, animated: false });
  }, [width]);

  useEffect(() => {
    if (!heroSlides.length) return;
    const interval = setInterval(() => {
      if (!interacting.current) goTo(activeIndex + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeIndex, goTo, heroSlides.length]);

  useEffect(() => () => {
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    if (loopResetTimer.current) clearTimeout(loopResetTimer.current);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !heroSlides[0]?.imageUri) return;
    const href = heroDeliveryUrl(heroSlides[0].imageUri, width);
    const existing = document.head.querySelector(`link[data-hero-preload="1"]`);
    if (existing) existing.remove();
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    link.setAttribute("fetchpriority", "high");
    link.setAttribute("data-hero-preload", "1");
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [heroSlides, width]);


  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!heroSlides.length) return;
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (rawIndex === heroSlides.length) {
      activeIndexRef.current = 0;
      setActiveIndex(0);
      if (loopResetTimer.current) clearTimeout(loopResetTimer.current);
      loopResetTimer.current = setTimeout(
        () => scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false }),
        50,
      );
    } else {
      activeIndexRef.current = Math.max(0, Math.min(rawIndex, heroSlides.length - 1));
      setActiveIndex(activeIndexRef.current);
    }
    finishInteractionLater();
  };

  const openSlide = (slide: HeroSlideView) => {
    interacting.current = true;
    finishInteractionLater();
    const destination = heroSlideDestination({
      category_slug: slide.categorySlug,
      category_name: slide.categoryName,
    });
    router.push(destination);
  };

  // Always reserve the 16:9 shell so categories below never jump when slides arrive.
  const shellStyle = [
    styles.shell,
    {
      width,
      maxWidth: width,
      borderRadius: radius,
      aspectRatio: HERO_IMAGE_ASPECT,
    },
  ];

  if (loadError) {
    return (
      <View style={[shellStyle, styles.errorShell]}>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  if (loading || !heroSlides.length) {
    return <View style={shellStyle} accessibilityLabel="Loading hero images" />;
  }

  return (
    <View style={shellStyle}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.scroller}
        contentContainerStyle={styles.scrollerContent}
        onScrollBeginDrag={() => {
          interacting.current = true;
          if (interactionTimer.current) clearTimeout(interactionTimer.current);
        }}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {slides.map((slide, index) => (
          <View
            key={index === slides.length - 1 ? `${slide.id}-loop` : slide.id}
            style={[styles.slide, { width }]}
          >
            <HeroSlideMedia
              uri={slide.imageUri}
              accessibilityLabel={`${slide.categoryName} hero slide`}
              displayWidth={width}
              priority={index === 0}
            />
            <View style={[styles.ctaWrap, narrow && styles.ctaWrapNarrow, desktop && styles.ctaWrapDesktop]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${slide.ctaLabel}: browse ${slide.categoryName}`}
                onPress={() => openSlide(slide)}
                onPressIn={() => setPressedControl(`cta-${index}`)}
                onPressOut={() => setPressedControl(null)}
                onHoverIn={() => setHoveredCta(`cta-${index}`)}
                onHoverOut={() => setHoveredCta(null)}
                style={[
                  styles.cta,
                  narrow && styles.ctaNarrow,
                  hoveredCta === `cta-${index}` && Platform.OS === "web" && styles.ctaHover,
                  pressedControl === `cta-${index}` && styles.ctaPressed,
                ]}
              >
                <Text style={[styles.ctaText, narrow && styles.ctaTextNarrow]}>{slide.ctaLabel}</Text>
                <ChevronRight size={13} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      {heroSlides.length > 1 && desktop ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous hero slide"
            onPress={() => goTo(activeIndex - 1)}
            onPressIn={() => setPressedControl("previous")}
            onPressOut={() => setPressedControl(null)}
            style={[styles.arrow, styles.arrowLeft, pressedControl === "previous" && styles.arrowPressed]}
          >
            <ChevronLeft size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next hero slide"
            onPress={() => goTo(activeIndex + 1)}
            onPressIn={() => setPressedControl("next")}
            onPressOut={() => setPressedControl(null)}
            style={[styles.arrow, styles.arrowRight, pressedControl === "next" && styles.arrowPressed]}
          >
            <ChevronRight size={20} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}

      <View
        style={styles.indicators}
        pointerEvents="box-none"
        accessibilityLabel={`Hero slide ${activeIndex + 1} of ${heroSlides.length}`}
      >
        {heroSlides.map((slide, index) => (
          <Pressable
            key={slide.id}
            accessibilityRole="button"
            accessibilityLabel={`Show hero slide ${index + 1}`}
            accessibilityState={{ selected: activeIndex === index }}
            onPress={() => {
              interacting.current = true;
              goTo(index);
              finishInteractionLater();
            }}
            style={styles.indicatorHit}
          >
            <View style={[styles.indicator, activeIndex === index && styles.indicatorActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#141014",
    margin: 0,
    padding: 0,
    borderWidth: 0,
    alignSelf: "center",
  },
  scroller: {
    width: "100%",
    // flex:1 inside an aspect-ratio box stretches children on web — use 100% instead.
    height: "100%",
    overflow: "hidden",
    margin: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  scrollerContent: {
    alignItems: "stretch",
    margin: 0,
    padding: 0,
  },
  errorShell: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: brandPalette.light.muted,
    borderWidth: 1,
    borderColor: brandPalette.light.border,
    aspectRatio: undefined,
    minHeight: 72,
  },
  errorText: {
    color: brandPalette.light.destructive,
    fontFamily: fonts.sans.semibold,
    fontSize: typeScale.bodyCompact,
    textAlign: "center",
  },
  slide: {
    height: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "transparent",
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  ctaWrap: {
    position: "absolute",
    zIndex: 2,
    left: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  ctaWrapNarrow: { paddingHorizontal: 14, paddingBottom: 16 },
  ctaWrapDesktop: { paddingHorizontal: 42, paddingBottom: 28 },
  cta: {
    minHeight: 36,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: PINK,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ctaNarrow: { minHeight: 34, paddingHorizontal: 12 },
  ctaHover: { transform: [{ translateY: -1 }], backgroundColor: "#9D174D" },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ctaText: {
    color: brandPalette.light.primaryForeground,
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.bodyCompact,
  },
  ctaTextNarrow: { fontSize: typeScale.metadata },
  indicators: {
    position: "absolute",
    zIndex: 4,
    left: 0,
    right: 0,
    bottom: 4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  /** 44×44 pressable; visual dot stays small inside. */
  indicatorHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(233,30,99,.28)" },
  indicatorActive: { width: 20, backgroundColor: brandPalette.light.primary },
  arrow: {
    position: "absolute",
    zIndex: 4,
    top: "50%",
    width: 44,
    height: 44,
    marginTop: -22,
    borderRadius: 22,
    backgroundColor: "rgba(25,12,18,.50)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: { left: 14 },
  arrowRight: { right: 14 },
  arrowPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
