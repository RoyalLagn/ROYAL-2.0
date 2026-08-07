import React from "react";
import { View, type ViewProps } from "react-native";

type Props = ViewProps & { direction?: "up" | "down"; delay?: number };

/**
 * Soft opacity reveal only — no translateY. Vertical motion was a CLS
 * contributor when the hero/categories entered the layout.
 */
export default function HomeReveal({ children, delay = 0, ...props }: Props) {
  const ref = React.useRef<View>(null);

  React.useEffect(() => {
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let mounted = true;
    let cleanup: () => void = () => undefined;
    import("gsap").then(({ default: gsap }) => {
      if (!mounted || !ref.current) return;
      const context = gsap.context(() => {
        gsap.fromTo(
          ref.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.28, delay: delay / 1000, ease: "power1.out", immediateRender: false },
        );
      }, ref.current);
      cleanup = () => context.revert();
    }).catch(() => undefined);
    return () => {
      mounted = false;
      cleanup();
    };
  }, [delay]);

  return <View ref={ref} {...props}>{children}</View>;
}
