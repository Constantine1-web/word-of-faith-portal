"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Fired by the top navbar hamburger to toggle the current page's sidebar drawer. */
export const DRAWER_TOGGLE_EVENT = "wof:drawer-toggle";
/** Fired by a drawer whenever it opens/closes so the navbar can mirror its state. */
export const DRAWER_STATE_EVENT = "wof:drawer-state";

/** Drawer mode applies below this width (matches the 1024px sidebar breakpoint). */
const MOBILE_QUERY = "(max-width: 1023.98px)";
/** On mobile the drawer closes itself after this much time without interaction. */
export const DRAWER_IDLE_MS = 10_000;

/**
 * Shared behaviour for off-canvas sidebars (mobile / tablet only):
 * - toggled by the navbar hamburger (single button, left side) or locally
 * - auto-closes after 10s of inactivity; touching, scrolling or tapping inside resets the timer
 * - Escape closes it; the page behind is never scroll-locked, so content stays usable
 * - desktop (>= 1024px) is unaffected
 */
export function useMobileDrawer(drawerRef: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const armTimer = useCallback(() => {
    clearTimer();
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    timer.current = setTimeout(() => setOpen(false), DRAWER_IDLE_MS);
  }, []);

  // Navbar hamburger toggles the drawer.
  useEffect(() => {
    const onToggle = (e: Event) => {
      if (!window.matchMedia(MOBILE_QUERY).matches) return;
      // Let the navbar know a drawer handled this tap.
      const detail = (e as CustomEvent).detail;
      if (detail) detail.handled = true;
      setOpen((v) => !v);
    };
    window.addEventListener(DRAWER_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(DRAWER_TOGGLE_EVENT, onToggle);
  }, []);

  // Mirror state to the navbar and manage idle timer + Escape.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(DRAWER_STATE_EVENT, { detail: { open } }));
    if (!open) {
      clearTimer();
      return;
    }
    armTimer();

    const el = drawerRef.current;
    const reset = () => armTimer();
    const events = ["touchstart", "touchmove", "pointerdown", "pointermove", "wheel", "scroll", "keydown"];
    events.forEach((e) => el?.addEventListener(e, reset, { passive: true, capture: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      events.forEach((e) => el?.removeEventListener(e, reset, { capture: true }));
      window.removeEventListener("keydown", onKey);
      clearTimer();
    };
  }, [open, armTimer, drawerRef]);

  // Close if the viewport grows to desktop size.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => {
      if (!mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return { open, setOpen };
}
