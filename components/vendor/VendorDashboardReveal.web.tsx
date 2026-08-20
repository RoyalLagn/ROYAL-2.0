import React, { useEffect, useRef } from "react";
import { StyleProp, useWindowDimensions, View, ViewStyle } from "react-native";

type Props = {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

export default function VendorDashboardReveal({ children, delay = 0, style }: Props) {
  const root = useRef<View>(null);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined" || !root.current) return;
    const element = root.current as unknown as HTMLElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    let animation: any = null;
    let context: any = null;
    let triggerPlugin: any = null;

    const setup = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      triggerPlugin = ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        if (reduceMotion) {
          gsap.set(element, { clearProps: "opacity,transform" });
          return;
        }
        animation = gsap.fromTo(
          element,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            delay: delay / 1000,
            duration: 0.22,
            ease: "power2.out",
            scrollTrigger: {
              trigger: element,
              start: "top 96%",
              once: true,
              invalidateOnRefresh: true,
            },
          },
        );
      }, element);
      if ("fonts" in document) await document.fonts.ready.catch(() => undefined);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!cancelled) ScrollTrigger.refresh();
      }));
    };
    setup().catch(() => undefined);

    return () => {
      cancelled = true;
      animation?.scrollTrigger?.kill();
      animation?.kill();
      context?.revert();
      triggerPlugin?.getAll()
        .filter((trigger: any) => trigger.trigger === element)
        .forEach((trigger: any) => trigger.kill());
    };
  }, [delay, height, width]);

  return <View ref={root} style={style}>{children}</View>;
}
