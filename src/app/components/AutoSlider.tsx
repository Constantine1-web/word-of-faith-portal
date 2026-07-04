"use client";

import { useEffect, useRef } from "react";

export function AutoSlider({
  children,
  className,
  style,
  interval = 5000,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  interval?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const autoScroll = setInterval(() => {
      if (!scrollRef.current) return;
      const el = scrollRef.current;
      
      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (scrollLeft + clientWidth >= scrollWidth - 10) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        const childWidth = (el.children[0] as HTMLElement)?.clientWidth || 300;
        el.scrollBy({ left: childWidth, behavior: "smooth" });
      }
    }, interval);

    return () => clearInterval(autoScroll);
  }, [interval]);

  return (
    <div ref={scrollRef} className={className} style={style}>
      {children}
    </div>
  );
}
