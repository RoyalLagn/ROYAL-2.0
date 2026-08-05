import { Platform } from "react-native";
import { Easing, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";

/**
 * Central animation configuration for RoyalLagn.
 *
 * Every new animated component should read timing/spring/distance values
 * from here instead of hardcoding its own magic numbers, so the whole app
 * shares one consistent, premium feel and a single place to tune it.
 *
 * This does not replace bespoke, already-tuned animations that exist
 * elsewhere (e.g. components/MobileTabBar.tsx's tab indicator) -- those
 * were reviewed and are already good; this file is the source of truth for
 * everything built going forward.
 */

// ---------------------------------------------------------------------------
// Durations (ms) -- kept in the 180-320ms "premium, not flashy" range called
// for across the app. Nothing here should feel like a full-screen slide.
// ---------------------------------------------------------------------------
export const MotionDuration = {
  /** Micro feedback: press states, icon swaps, badge colour changes. */
  instant: 120,
  /** Default for most fades, card entrances, focus transitions. */
  fast: 200,
  /** Screen-level content transitions, modal/sheet open. */
  base: 260,
  /** Larger surfaces: bottom sheets, branded loader fade. */
  slow: 320,
  /** Decorative loops only (skeleton shimmer, loader pulse). */
  loop: 1100,
} as const;

// ---------------------------------------------------------------------------
// Distances (px) -- deliberately small. Stack screens should never look
// like a full-screen slide-in; this is a "settle into place" nudge.
// ---------------------------------------------------------------------------
export const MotionDistance = {
  /** Page-entry vertical/horizontal nudge. */
  screenEnter: 12,
  /** Card/list-item entrance nudge. */
  cardEnter: 8,
  /** Bottom sheet rise distance is computed from content height by the
   *  component itself; this is only the initial peek offset. */
  sheetPeek: 24,
} as const;

// ---------------------------------------------------------------------------
// Press feedback -- used by AnimatedPressable/AnimatedCard.
// ---------------------------------------------------------------------------
export const MotionPress = {
  scale: 0.98,
  opacity: 0.92,
} as const;

// ---------------------------------------------------------------------------
// Easing curves (reanimated `Easing`) for timing-based animations.
// ---------------------------------------------------------------------------
export const MotionEasing = {
  /** Standard "settle" curve for entrances and fades. */
  standard: Easing.bezier(0.22, 1, 0.36, 1),
  /** Symmetric ease for crossfades/colour transitions. */
  soft: Easing.inOut(Easing.quad),
  /** Quick, snappy curve for press/tap feedback. */
  press: Easing.out(Easing.cubic),
} as const;

// ---------------------------------------------------------------------------
// Spring presets (reanimated `withSpring`) -- gentle, not bouncy.
// ---------------------------------------------------------------------------
export const MotionSpring: Record<"gentle" | "snappy" | "press", WithSpringConfig> = {
  /** Default for entrances and layout settling. */
  gentle: { damping: 20, stiffness: 190, mass: 0.7 },
  /** Tab indicators, small UI state changes. */
  snappy: { damping: 18, stiffness: 220, mass: 0.6 },
  /** Press-in/press-out. */
  press: { damping: 15, stiffness: 260, mass: 0.55 },
};

export const MotionTiming = {
  fast: { duration: MotionDuration.fast, easing: MotionEasing.standard } satisfies WithTimingConfig,
  base: { duration: MotionDuration.base, easing: MotionEasing.standard } satisfies WithTimingConfig,
  slow: { duration: MotionDuration.slow, easing: MotionEasing.standard } satisfies WithTimingConfig,
  press: { duration: MotionDuration.instant, easing: MotionEasing.press } satisfies WithTimingConfig,
};

/**
 * The single native-stack transition preset used across the whole app (see
 * app/_layout.tsx). `fade_from_bottom` is react-native-screens' built-in
 * "soft fade + small upward settle" preset -- it is native-driven (no JS
 * thread cost, works with the iOS interactive swipe-back gesture out of the
 * box) which is why we use the platform preset here instead of a bespoke
 * reanimated screen wrapper: a custom JS-driven transition would fight the
 * native-stack's own gesture-driven pop animation and risk jank without
 * adding a new dependency (react-native-screens/native-stack is already the
 * router's transport). Back navigation automatically reverses this same
 * animation -- there is nothing extra to configure per screen.
 */
export const SCREEN_TRANSITION = "fade_from_bottom" as const;

/** Modal/bottom-sheet presentation transition (native-stack preset). */
export const MODAL_TRANSITION = "fade" as const;

/**
 * Whether to request the native driver / GPU-composited path for a given
 * animated property. Layout properties (width/height/top/left) are never
 * native-driver eligible; transform/opacity are on both platforms except
 * Expo Go on some SDKs where the module can be unavailable -- reanimated
 * handles that automatically, this helper exists for the handful of call
 * sites still using the RN core `Animated` API.
 */
export function supportsNativeDriver(property: "transform" | "opacity" | "layout") {
  if (property === "layout") return false;
  // react-native-web has no native driver; RN core Animated silently warns
  // if useNativeDriver is requested there, so gate it off explicitly.
  return Platform.OS !== "web";
}
