import React from "react";
import { View, type ViewProps } from "react-native";

type Props = ViewProps & { direction?: "up" | "down"; delay?: number };

export default function HomeReveal({ children, direction = "up", delay = 0, ...props }: Props) {
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
          { opacity: 0, y: direction === "down" ? -10 : 10 },
          { opacity: 1, y: 0, duration: 0.38, delay: delay / 1000, ease: "power2.out", immediateRender: false },
        );
      }, ref.current);
      cleanup = () => context.revert();
    }).catch(() => undefined);
    return () => {
      mounted = false;
      cleanup();
    };
  }, [delay, direction]);

  return <View ref={ref} {...props}>{children}</View>;
}
