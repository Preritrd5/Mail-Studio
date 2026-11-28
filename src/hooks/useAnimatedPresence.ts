import { useState, useEffect } from 'react';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Manages mount and smooth exit transitions for modals, dropdowns, and overlays.
 * Unmounts cleanly after exitDurationMs without blocking rapid re-opens or reduced-motion users.
 */
export function useAnimatedPresence(isOpen: boolean, exitDurationMs = 190) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [phase, setPhase] = useState<'enter' | 'exit'>(isOpen ? 'enter' : 'exit');

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setPhase('enter');
      return;
    }

    if (!shouldRender) return;

    if (prefersReducedMotion()) {
      setShouldRender(false);
      setPhase('exit');
      return;
    }

    setPhase('exit');
    const timer = window.setTimeout(() => {
      setShouldRender(false);
    }, exitDurationMs);

    return () => window.clearTimeout(timer);
  }, [isOpen, exitDurationMs, shouldRender]);

  return {
    shouldRender,
    isClosing: phase === 'exit',
    phase,
  };
}
