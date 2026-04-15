import { useEffect, useRef } from 'react';

const BOTTOM_THRESHOLD_PX = 80;
const PROGRAMMATIC_SCROLL_LOCK_MS = 160;

function isNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD_PX;
}

function scrollToBottom(element: HTMLDivElement, behavior: ScrollBehavior = 'auto'): void {
  element.scrollTo({
    top: element.scrollHeight,
    behavior,
  });
}

export function useStickToBottomInstant(resetKey?: string) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastKeyRef = useRef(resetKey);
  const stickToBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);

  const markProgrammaticScroll = () => {
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_LOCK_MS;
  };

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    lastScrollTopRef.current = scrollElement.scrollTop;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        stickToBottomRef.current = false;
      }
    };

    const handleScroll = () => {
      const currentScrollTop = scrollElement.scrollTop;
      const nearBottom = isNearBottom(scrollElement);
      const isProgrammaticScroll = Date.now() <= programmaticScrollUntilRef.current;

      if (!isProgrammaticScroll && currentScrollTop < lastScrollTopRef.current - 1) {
        // User started scrolling upward: immediately detach from auto-follow,
        // even if they are still within the bottom threshold.
        stickToBottomRef.current = false;
      } else if (nearBottom) {
        stickToBottomRef.current = true;
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    handleScroll();
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      scrollElement.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    if (resetKey !== lastKeyRef.current) {
      initializedRef.current = false;
      stickToBottomRef.current = true;
      lastKeyRef.current = resetKey;
    }
  }, [resetKey]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || initializedRef.current) return;

    scrollElement.style.visibility = 'hidden';

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        markProgrammaticScroll();
        scrollElement.scrollTop = scrollElement.scrollHeight;
        lastScrollTopRef.current = scrollElement.scrollTop;
        scrollElement.style.visibility = '';
        initializedRef.current = true;
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      scrollElement.style.visibility = '';
    };
  }, [resetKey]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      markProgrammaticScroll();
      scrollToBottom(scrollElement, 'auto');
      lastScrollTopRef.current = scrollElement.scrollTop;
    });

    observer.observe(contentElement);
    return () => {
      observer.disconnect();
    };
  }, [resetKey]);

  return {
    scrollRef,
    contentRef,
  };
}
