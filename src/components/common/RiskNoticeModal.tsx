import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RISK_NOTICE_CONTENT_MARKDOWN,
  RISK_NOTICE_EFFECTIVE_DATE,
  RISK_NOTICE_TITLE,
} from '@/lib/risk-notice';

interface RiskNoticeModalProps {
  onAccept: () => void;
  onReject: () => void;
}

const markdownComponents: Components = {
  h2: ({ ...props }) => (
    <h2
      className="mt-10 border-t border-border/80 pt-8 text-2xl font-semibold tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0"
      {...props}
    />
  ),
  h3: ({ ...props }) => (
    <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground" {...props} />
  ),
  p: ({ ...props }) => (
    <p className="mt-4 text-sm leading-7 text-foreground/85 first:mt-0" {...props} />
  ),
  ul: ({ ...props }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/85" {...props} />
  ),
  ol: ({ ...props }) => (
    <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-foreground/85" {...props} />
  ),
  li: ({ ...props }) => <li className="pl-1" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  code: ({ ...props }) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
      {...props}
    />
  ),
};

function hasReachedScrollBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 24;
}

export function RiskNoticeModal({ onAccept, onReject }: RiskNoticeModalProps) {
  const titleId = useId();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [hasReachedBottom, setHasReachedBottom] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      if (!scrollAreaRef.current) {
        return;
      }
      scrollAreaRef.current.focus();
      setHasReachedBottom(hasReachedScrollBottom(scrollAreaRef.current));
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleScroll = () => {
    if (!scrollAreaRef.current) {
      return;
    }
    setHasReachedBottom(hasReachedScrollBottom(scrollAreaRef.current));
  };

  const handleScrollToBottom = () => {
    if (!scrollAreaRef.current) {
      return;
    }

    scrollAreaRef.current.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-black/55 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="grid max-h-[min(88vh,860px)] w-full max-w-4xl grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-2xl"
        >
          <div className="border-b border-border/80 px-6 py-4 text-sm text-muted-foreground">
            请仔细阅读以下内容，滚动到底部后方可确认
          </div>

          <div className="relative min-h-0">
            <div
              ref={scrollAreaRef}
              tabIndex={0}
              onScroll={handleScroll}
              className="h-full overflow-y-auto px-6 py-8 outline-none sm:px-8"
            >
              <div className="mx-auto max-w-3xl">
                <header className="border-b border-border/70 pb-8 text-center">
                  <h1 id={titleId} className="text-4xl font-semibold tracking-tight text-foreground">
                    {RISK_NOTICE_TITLE}
                  </h1>
                  <p className="mt-4 text-sm font-medium text-foreground/75">
                    生效日期：{RISK_NOTICE_EFFECTIVE_DATE}
                  </p>
                </header>

                <div className="mt-8">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {RISK_NOTICE_CONTENT_MARKDOWN}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            {!hasReachedBottom && (
              <button
                type="button"
                aria-label="滚动到底部"
                onClick={handleScrollToBottom}
                className="absolute bottom-5 left-1/2 inline-flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-xl border border-border/80 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-muted/80 hover:text-foreground"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/80 bg-background/90 px-6 py-4">
            <Button variant="outline" onClick={onReject}>
              拒绝
            </Button>
            {hasReachedBottom ? (
              <Button onClick={onAccept}>
                我已阅读并同意
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-not-allowed">
                    <Button disabled>
                      我已阅读并同意
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  请先滚动到底部
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
