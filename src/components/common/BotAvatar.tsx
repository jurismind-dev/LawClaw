import botAvatar from '@/assets/bot-avatar.png';
import { cn } from '@/lib/utils';

interface BotAvatarProps {
  size?: 'sm' | 'lg';
  className?: string;
  alt?: string;
}

export function BotAvatar({
  size = 'sm',
  className,
  alt = 'LawClaw avatar',
}: BotAvatarProps) {
  return (
    <img
      src={botAvatar}
      alt={alt}
      draggable={false}
      className={cn(
        'select-none object-contain',
        size === 'lg' ? 'h-16 w-16 rounded-2xl' : 'h-8 w-8 rounded-lg',
        className
      )}
    />
  );
}
