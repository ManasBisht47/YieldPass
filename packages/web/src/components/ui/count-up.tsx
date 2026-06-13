"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value:     number;
  decimals?: number;
  prefix?:   string;
  suffix?:   string;
  duration?: number;   // ms
  className?: string;
}

/**
 * Animates a number from 0 to `value` (ease-out cubic) the first time it
 * enters the viewport, then tracks `value` changes with a short re-animation.
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 1100, className }: CountUpProps) {
  const [display, setDisplay]   = useState(0);
  const elRef                   = useRef<HTMLSpanElement>(null);
  const startedRef              = useRef(false);
  const fromRef                 = useRef(0);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let raf = 0;
    const animate = (from: number, to: number, ms: number) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / ms, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(from + (to - from) * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
        else fromRef.current = to;
      };
      raf = requestAnimationFrame(tick);
    };

    if (!startedRef.current) {
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          animate(0, value, duration);
          io.disconnect();
        }
      }, { threshold: 0.4 });
      io.observe(el);
      return () => { io.disconnect(); cancelAnimationFrame(raf); };
    }

    // Value changed after initial run — quick settle
    animate(fromRef.current, value, 450);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span ref={elRef} className={className}>
      {prefix}{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
