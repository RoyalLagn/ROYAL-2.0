import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  type ImageSourcePropType,
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
import { LinearGradient } from "expo-linear-gradient";

const PINK = "#E91E63";

type HeroSlide = {
  id: string;
  image: ImageSourcePropType;
  eyebrow: string;
  title: string;
  highlightedText: string;
  description: string;
  ctaLabel: string;
  route: "/(tabs)/Categories" | "/VendorsListing";
  category?: string;
};

const HERO_SLIDES: HeroSlide[] = [
  {
    id: "dream",
    image: require("../../assets/hero-banner.png"),
    eyebrow: "YOUR WEDDING, BEAUTIFULLY PLANNED",
    title: "Plan Your",
    highlightedText: "Dream Wedding",
    description: "Everything from venues to photography, made effortless.",
    ctaLabel: "Explore Vendors",
    route: "/(tabs)/Categories",
  },
  {
    id: "venues",
    image: { uri: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1600&auto=format&fit=crop&q=82" },
    eyebrow: "CELEBRATE SOMEWHERE EXTRAORDINARY",
    title: "Discover",
    highlightedText: "Picture-Perfect Venues",
    description: "Find beautiful wedding spaces near {{city}}.",
    ctaLabel: "View Venues",
    route: "/VendorsListing",
    category: "Venues",
  },
  {
    id: "photography",
    image: { uri: "https://images.unsplash.com/photo-1606800052052-a08af7148866?w=1600&auto=format&fit=crop&q=82" },
    eyebrow: "STORIES WORTH REMEMBERING",
    title: "Capture Every",
    highlightedText: "Beautiful Moment",
    description: "Explore trusted photographers for your special day.",
    ctaLabel: "Find Photographers",
    route: "/VendorsListing",
    category: "Photographers",
  },
  {
    id: "services",
    image: { uri: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1600&auto=format&fit=crop&q=82" },
    eyebrow: "MAKE THE CELEBRATION YOURS",
    title: "Celebrate in",
    highlightedText: "Your Own Style",
    description: "Discover decorators, caterers and wedding specialists.",
    ctaLabel: "Browse Services",
    route: "/(tabs)/Categories",
  },
];

type HeroCarouselProps = {
  width: number;
  city: string;
  desktop: boolean;
};

export default function HeroCarousel({ width, city, desktop }: HeroCarouselProps) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interacting = useRef(false);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const slides = useMemo(() => [...HERO_SLIDES, HERO_SLIDES[0]], []);

  const finishInteractionLater = useCallback(() => {
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    interactionTimer.current = setTimeout(() => {
      interacting.current = false;
    }, 1400);
  }, []);

  const goTo = useCallback((index: number, animated = true) => {
    const target = index < 0 ? HERO_SLIDES.length - 1 : index;
    scrollRef.current?.scrollTo({ x: target * width, y: 0, animated });
    if (target < HERO_SLIDES.length) {
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
  }, [width]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndexRef.current * width, y: 0, animated: false });
  }, [width]); // Keep the active slide aligned after a responsive resize.

  useEffect(() => {
    const interval = setInterval(() => {
      if (!interacting.current) goTo(activeIndex + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeIndex, goTo]);

  useEffect(() => () => {
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    if (loopResetTimer.current) clearTimeout(loopResetTimer.current);
  }, []);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (rawIndex === HERO_SLIDES.length) {
      activeIndexRef.current = 0;
      setActiveIndex(0);
      if (loopResetTimer.current) clearTimeout(loopResetTimer.current);
      loopResetTimer.current = setTimeout(
        () => scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false }),
        50,
      );
    } else {
      activeIndexRef.current = Math.max(0, Math.min(rawIndex, HERO_SLIDES.length - 1));
      setActiveIndex(activeIndexRef.current);
    }
    finishInteractionLater();
  };

  const openSlide = (slide: HeroSlide) => {
    interacting.current = true;
    finishInteractionLater();
    if (slide.route === "/VendorsListing") {
      router.push({ pathname: slide.route, params: { category: slide.category } });
    } else {
      router.push(slide.route);
    }
  };

  return (
    <View style={[styles.shell, desktop && styles.shellDesktop, { width }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          interacting.current = true;
          if (interactionTimer.current) clearTimeout(interactionTimer.current);
        }}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {slides.map((slide, index) => (
          <View key={`${slide.id}-${index}`} style={[styles.slide, { width }]}>
            <Image
              source={slide.image}
              resizeMode="cover"
              accessibilityLabel={`${slide.highlightedText} wedding campaign`}
              style={[
                StyleSheet.absoluteFillObject,
                styles.image,
                Platform.OS === "web" ? ({ objectFit: "cover", objectPosition: "center" } as never) : null,
              ]}
            />
            <LinearGradient
              colors={["rgba(18,8,14,.84)", "rgba(20,9,15,.54)", "rgba(17,8,13,.06)"]}
              locations={[0, 0.52, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.copy, desktop && styles.copyDesktop]}>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              <Text style={[styles.title, desktop && styles.titleDesktop]}>{slide.title}</Text>
              <Text numberOfLines={2} style={[styles.highlight, desktop && styles.highlightDesktop]}>{slide.highlightedText}</Text>
              <Text numberOfLines={2} style={[styles.description, desktop && styles.descriptionDesktop]}>
                {slide.description.replace("{{city}}", city)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${slide.ctaLabel}: ${slide.highlightedText}`}
                onPress={() => openSlide(slide)}
                style={({ pressed, hovered }) => [
                  styles.cta,
                  hovered && Platform.OS === "web" && styles.ctaHover,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Text style={styles.ctaText}>{slide.ctaLabel}</Text>
                <ChevronRight size={15} color="#FFFFFF" />
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

      <View style={styles.indicators} accessibilityLabel={`Hero slide ${activeIndex + 1} of ${HERO_SLIDES.length}`}>
        {HERO_SLIDES.map((slide, index) => (
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
  shell: { aspectRatio: 16 / 8.7, borderRadius: 22, overflow: "hidden", position: "relative", backgroundColor: "#2A1720" },
  shellDesktop: { aspectRatio: 16 / 6.4, borderRadius: 26 },
  slide: { height: "100%", position: "relative", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  copy: { position: "absolute", left: 0, top: 0, bottom: 0, width: "72%", paddingHorizontal: 18, justifyContent: "center" },
  copyDesktop: { width: "56%", paddingHorizontal: 54 },
  eyebrow: { color: "rgba(255,255,255,.84)", fontSize: 7, lineHeight: 10, fontWeight: "900", letterSpacing: 1.05, marginBottom: 6 },
  title: { color: "#FFFFFF", fontFamily: Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" }), fontSize: 21, lineHeight: 24, fontWeight: "700" },
  titleDesktop: { fontSize: 39, lineHeight: 43 },
  highlight: { color: "#FF4D8D", fontFamily: Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" }), fontSize: 22, lineHeight: 25, fontWeight: "700", fontStyle: "italic" },
  highlightDesktop: { fontSize: 41, lineHeight: 46 },
  description: { maxWidth: 290, color: "rgba(255,255,255,.90)", fontSize: 10, lineHeight: 14, marginTop: 6 },
  descriptionDesktop: { maxWidth: 470, fontSize: 13, lineHeight: 19, marginTop: 10 },
  cta: { minHeight: 38, alignSelf: "flex-start", marginTop: 11, paddingHorizontal: 14, borderRadius: 999, backgroundColor: PINK, flexDirection: "row", alignItems: "center", gap: 4, shadowColor: "#3D0D20", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  ctaHover: { transform: [{ translateY: -1 }], backgroundColor: "#D81758" },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ctaText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  indicators: { position: "absolute", left: 0, right: 0, bottom: 9, flexDirection: "row", justifyContent: "center", gap: 5 },
  indicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,.58)" },
  indicatorActive: { width: 20, backgroundColor: PINK },
  arrow: { position: "absolute", top: "50%", width: 38, height: 38, marginTop: -19, borderRadius: 19, backgroundColor: "rgba(25,12,18,.50)", alignItems: "center", justifyContent: "center" },
  arrowLeft: { left: 14 },
  arrowRight: { right: 14 },
});
