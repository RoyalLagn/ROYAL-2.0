import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import HeroSlideMedia from "@/components/home/HeroSlideMedia";
import { HeroSlideService } from "@/services/heroSlides";
import {
  HERO_DESKTOP_ASPECT,
  HERO_MOBILE_ASPECT,
  heroSlideDestination,
  heroSlideImageUrl,
} from "@/types/hero";

const PINK = "#E91E63";
const DESKTOP_MAX_HEIGHT = 420;
const DESKTOP_MIN_HEIGHT = 240;

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
};

function desktopHeroHeight(width: number) {
  const ideal = Math.round(width / HERO_DESKTOP_ASPECT);
  return Math.min(DESKTOP_MAX_HEIGHT, Math.max(DESKTOP_MIN_HEIGHT, ideal));
}

export default function HeroCarousel({ width, desktop }: HeroCarouselProps) {
  // Desktop keeps its clamped height. Mobile is driven purely by HERO_MOBILE_ASPECT,
  // so the shell scales with the viewport instead of snapping between clamp bounds —
  // that clamping is what shifted the layout between small and large phones.
  const desktopHeight = desktop ? desktopHeroHeight(width) : undefined;
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
  const slides = useMemo(
    () => (heroSlides.length ? [...heroSlides, heroSlides[0]] : []),
    [heroSlides],
  );
  const narrow = !desktop && width < 340;
  const radius = desktop ? 26 : 22;

  useEffect(() => {
    let active = true;

    const mapRows = async (force = false) => {
      try {
        const rows = await HeroSlideService.listActivePublic(force);
        if (!active) return;
        setLoadError(null);
        setHeroSlides(
          rows.map((row) => ({
            id: row.id,
            imageUri: heroSlideImageUrl(row, desktop),
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
  }, [desktop]);

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

  if (loadError) {
    return (
      <View style={[styles.shell, desktop && styles.shellDesktop, styles.errorShell, { width, minHeight: 72 }]}>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  if (loading || !heroSlides.length) return null;

  return (
    <View
      style={[
        styles.shell,
        desktop ? styles.shellDesktop : styles.shellMobile,
        { width, maxWidth: width, borderRadius: radius },
        desktop
          ? { height: desktopHeight }
          : { aspectRatio: HERO_MOBILE_ASPECT },
      ]}
    >
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
          <View key={`${slide.id}-${index}`} style={[styles.slide, { width }]}>
            <HeroSlideMedia
              uri={slide.imageUri}
              accessibilityLabel={`${slide.categoryName} hero slide`}
              fill={desktop ? "blend" : "cover"}
            />
            <View style={[styles.ctaWrap, narrow && styles.ctaWrapNarrow, desktop && styles.ctaWrapDesktop]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${slide.ctaLabel}: browse ${slide.categoryName}`}
                onPress={() => openSlide(slide)}
                style={({ pressed, hovered }) => [
                  styles.cta,
                  narrow && styles.ctaNarrow,
                  hovered && Platform.OS === "web" && styles.ctaHover,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Text style={[styles.ctaText, narrow && styles.ctaTextNarrow]}>{slide.ctaLabel}</Text>
                <ChevronRight size={13} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      {desktop ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous hero slide" onPress={() => goTo(activeIndex - 1)} style={({ pressed }) => [styles.arrow, styles.arrowLeft, pressed && styles.ctaPressed]}>
            <ChevronLeft size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next hero slide" onPress={() => goTo(activeIndex + 1)} style={({ pressed }) => [styles.arrow, styles.arrowRight, pressed && styles.ctaPressed]}>
            <ChevronRight size={20} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}

      <View style={styles.indicators} accessibilityLabel={`Hero slide ${activeIndex + 1} of ${heroSlides.length}`}>
        {heroSlides.map((slide, index) => (
          <Pressable
            key={slide.id}
            accessibilityRole="button"
            accessibilityLabel={`Show hero slide ${index + 1}`}
            accessibilityState={{ selected: activeIndex === index }}
            hitSlop={8}
            onPress={() => {
              interacting.current = true;
              goTo(index);
              finishInteractionLater();
            }}
            style={[styles.indicator, activeIndex === index && styles.indicatorActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 22,
    overflow: "hidden",
    position: "relative",
    // Dark fill only as a load fallback — never white (white shows as edge strips).
    backgroundColor: "#141014",
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  shellDesktop: { borderRadius: 26, alignSelf: "center" },
  // Radius lives on the shell, not on each slide image: the pager holds every slide
  // side by side, so per-image corners would cut dark notches into the seam mid-swipe.
  // The shell is the single clipping boundary and every layer inside it is square.
  shellMobile: { borderRadius: 22, alignSelf: "center" },
  scroller: { flex: 1, overflow: "hidden", margin: 0, padding: 0, backgroundColor: "transparent" },
  scrollerContent: { alignItems: "stretch", margin: 0, padding: 0 },
  errorShell: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "#FFF5F7",
    borderWidth: 1,
    borderColor: "#F3C7D4",
  },
  errorText: { color: "#B4234A", fontSize: 12, fontWeight: "600", textAlign: "center" },
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
    minHeight: 29,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: PINK,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ctaNarrow: { minHeight: 27, paddingHorizontal: 8 },
  ctaHover: { transform: [{ translateY: -1 }], backgroundColor: "#D81758" },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ctaText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "800" },
  ctaTextNarrow: { fontSize: 8.5 },
  indicators: {
    position: "absolute",
    zIndex: 4,
    left: 0,
    right: 0,
    bottom: 9,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  indicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(233,30,99,.28)" },
  indicatorActive: { width: 20, backgroundColor: PINK },
  arrow: {
    position: "absolute",
    zIndex: 4,
    top: "50%",
    width: 38,
    height: 38,
    marginTop: -19,
    borderRadius: 19,
    backgroundColor: "rgba(25,12,18,.50)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: { left: 14 },
  arrowRight: { right: 14 },
});
