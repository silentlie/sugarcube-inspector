import { useEffect, useRef, useState } from "react";

/** A single viewport observer for every mounted variable subtree. */
const callbacks = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

function observe(element: Element, callback: (visible: boolean) => void) {
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry.isIntersecting);
      }
    });
  }
  callbacks.set(element, callback);
  observer.observe(element);

  return () => {
    callbacks.delete(element);
    observer?.unobserve(element);
    if (callbacks.size === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

/**
 * Observe the whole subtree rather than just the title row.
 * A parent must stay subscribed while any expanded descendant is visible,
 * so replacing that parent cannot leave visible children attached to stale objects.
 */
export function useObservedVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return observe(element, setVisible);
  }, []);

  return { ref, visible };
}
