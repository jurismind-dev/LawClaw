import { useEffect, useRef } from 'react';

const BOTTOM_THRESHOLD_PX = 80;

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

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      stickToBottomRef.current = isNearBottom(scrollElement);
    };

    handleScroll();
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
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
        scrollElement.scrollTop = scrollElement.scrollHeight;
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
      scrollToBottom(scrollElement, initializedRef.current ? 'smooth' : 'auto');
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
