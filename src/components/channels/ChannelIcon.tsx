import { cn } from '@/lib/utils';
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  getChannelIconUrl,
  type ChannelType,
} from '@/types/channel';

interface ChannelIconProps {
  type: ChannelType;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export function ChannelIcon({
  type,
  className,
  imageClassName,
  fallbackClassName,
}: ChannelIconProps) {
  const iconUrl = getChannelIconUrl(type);

  if (iconUrl) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-2xl bg-background/85 ring-1 ring-border/60 shadow-sm dark:bg-muted/30',
          className,
        )}
      >
        <img
          src={iconUrl}
          alt={CHANNEL_NAMES[type]}
          className={cn('object-contain', imageClassName)}
        />
      </span>
    );
  }

  return (
    <span
      aria-label={CHANNEL_NAMES[type]}
      className={cn(
        'inline-flex shrink-0 items-center justify-center leading-none',
        className,
        fallbackClassName,
      )}
    >
      {CHANNEL_ICONS[type]}
    </span>
  );
}
