import { useLayoutEffect, useRef } from 'react';

const DURATION_MS = 280;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Slides list items from where they were to where they are whenever `order` changes (FLIP:
 * First, Last, Invert, Play), as when the hand re-sorts on trump or closes up after a play.
 * Positions are layout offsets inside the list, which transforms (the deal-in animation, a
 * lifted card) don't disturb; the list itself must be `position: relative`.
 */
export function useFlip<K>(order: readonly K[]): (key: K) => (el: HTMLElement | null) => void {
  const nodes = useRef(new Map<K, HTMLElement>());
  const last = useRef(new Map<K, Point>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the order changes
  useLayoutEffect(() => {
    const animate = !prefersReducedMotion();
    const next = new Map<K, Point>();
    for (const [key, el] of nodes.current) {
      const now = { x: el.offsetLeft, y: el.offsetTop };
      next.set(key, now);
      const before = last.current.get(key);
      if (!animate || !before || typeof el.animate !== 'function') continue;
      const dx = before.x - now.x;
      const dy = before.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: DURATION_MS,
        easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
      });
    }
    last.current = next;
  }, [order]);

  return (key) => (el) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };
}
