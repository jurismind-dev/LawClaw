import { useEffect, useRef } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';

/**
 * A wrapper around useStickToBottom that ensures the initial scroll
 * to bottom happens instantly without any visible animation.
 *
 * @param resetKey - When this key changes, the scroll position will be reset to bottom instantly.
 *                   Typically this should be the conversation ID.
 */
export function useStickToBottomInstant(resetKey?: string) {
  const lastKeyRef = useRef(resetKey);
  const hasInitializedRef = useRef(false);

  const result = useStickToBottom({
    initial: 'instant',
    resize: 'smooth',
  });

  const { scrollRef } = result;

  useEffect(() => {
    if (resetKey !== lastKeyRef.current) {
      hasInitializedRef.current = false;
      lastKeyRef.current = resetKey;
    }
  }, [resetKey]);

  useEffect(() => {
    if (hasInitializedRef.current) return;

    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.style.visibility = 'hidden';

    const frame1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight;

        setTimeout(() => {
          scrollElement.style.visibility = '';
          hasInitializedRef.current = true;
        }, 0);
      });
    });

    return () => cancelAnimationFrame(frame1);
  }, [scrollRef, resetKey]);

  return result;
}
