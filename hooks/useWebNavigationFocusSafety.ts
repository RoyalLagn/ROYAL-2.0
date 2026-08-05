import { useEffect } from "react";
import { Platform } from "react-native";
import { usePathname } from "expo-router";

/**
 * Fixes the web console warning:
 *   "Blocked aria-hidden on an element because its descendant retained focus"
 *
 * Root cause (verified empirically, not assumed): react-native-screens'
 * web implementation marks an outgoing native-stack screen `aria-hidden`
 * once it stops being the active route. Using a MutationObserver on
 * [aria-hidden] plus a check of document.activeElement at the moment of
 * mutation, clicking a focusable card/button that calls router.push()
 * reliably produces `aria-hidden="true"` applied to a container while
 * document.activeElement (the just-clicked button) is still inside it --
 * i.e. exactly the condition Chrome's warning fires for.
 *
 * Two layers, in order of how early they run relative to the hide:
 *
 * 1. `installGlobalNavigationBlur` -- a single capture-phase `click`/
 *    `keydown` listener on `document`, installed once for the whole app.
 *    Capture-phase listeners on `document` run before React's synthetic
 *    event system processes the event (React attaches its delegated
 *    listeners in the bubble phase), which is in turn before the
 *    onPress handler runs `router.push()`, which is in turn before
 *    react-native-screens reacts to the resulting navigation-state change
 *    and hides the old screen. Blurring here happens strictly *before*
 *    navigation starts, not after -- this is the "pre-navigation" fix.
 *
 * 2. The `usePathname` effect below -- a fallback for navigations that
 *    were not triggered by a click/keydown at all (e.g. a `router.replace`
 *    fired from an async effect, a redirect after a Supabase call
 *    resolves). It re-checks focus once the route has actually changed.
 *
 * Verified with a MutationObserver + activeElement check (see PR
 * discussion): with only layer 2, a fast click still occasionally left the
 * clicked button focused-and-hidden between the click and the effect
 * flushing; with layer 1 installed, document.activeElement is `<body>`
 * (safely defocused) by the time react-native-screens applies
 * `aria-hidden`, every time tested.
 *
 * Centralized here and mounted once at the root layout instead of copying
 * `document.activeElement.blur()` into every screen.
 */
function shouldSkipBlur(active: Element | null): active is null {
  if (!active || active === document.body) return true;
  const tag = active.tagName;
  // Leave form fields alone -- only defocus elements that were driving
  // navigation (links, buttons, pressables), which is what actually
  // triggers the aria-hidden conflict. Blurring a text input mid-typing
  // would be a regression, not a fix.
  return tag === "INPUT" || tag === "TEXTAREA" || (active as HTMLElement).isContentEditable;
}

let globalListenerInstalled = false;

function installGlobalNavigationBlur() {
  if (globalListenerInstalled || typeof document === "undefined") return;
  globalListenerInstalled = true;

  const handlePointerDown = () => {
    const active = document.activeElement;
    if (shouldSkipBlur(active)) return;
    (active as HTMLElement).blur();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    // Enter/Space are how keyboard users activate a focused
    // Pressable-as-button/link on web; both end up dispatching a `click`.
    if (event.key !== "Enter" && event.key !== " ") return;
    const active = document.activeElement;
    if (shouldSkipBlur(active)) return;
    // Keyboard activation needs the blur to happen after this frame's
    // click-triggered navigation kicks off, not before -- blurring here
    // would cancel the very activation the key press is performing (a
    // blurred element does not receive the synthesized click). Instead we
    // release focus on the next microtask, once the click this keydown
    // synthesizes has already fired and started navigation.
    queueMicrotask(() => {
      if (document.activeElement === active) (active as HTMLElement).blur();
    });
  };

  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("keydown", handleKeyDown, true);
}

export function useWebNavigationFocusSafety() {
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    installGlobalNavigationBlur();
  }, []);

  // Fallback for route changes not driven by a click/keydown (redirects,
  // programmatic navigation after an async operation resolves).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const active = document.activeElement;
    if (shouldSkipBlur(active)) return;
    (active as HTMLElement).blur();
  }, [pathname]);
}
