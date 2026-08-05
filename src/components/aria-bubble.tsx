import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { useAriaStore } from '@/store/aria-store';
import { AriaAvatar } from './aria-avatar';
import { UserAvatar } from './user-avatar';
import { Text } from './ui/text';

/** A chat bubble in the Aria flow, from Aria (left) or Maya (right). */
export function AriaBubble({
  from,
  children,
  className,
}: {
  from: 'aria' | 'maya';
  children: React.ReactNode;
  className?: string;
}) {
  const isAria = from === 'aria';
  // Read here rather than threading it through five call sites; every screen
  // that shows a bubble means the signed-in person by "maya".
  const avatarUri = useAriaStore((s) => s.profile.avatarUri);
  const name = useAriaStore((s) => s.profile.name);

  return (
    <Animated.View
      entering={FadeInDown.duration(280).springify().damping(18)}
      className={cn('flex-row gap-2.5', isAria ? 'pr-8' : 'flex-row-reverse pl-8', className)}>
      {/* Both sides carry a face. Only Aria had one before, which made the
          conversation read as Aria talking and the replies coming from nowhere.
          `flex-row-reverse` puts this one on the right, against its own bubble. */}
      {isAria ? (
        <AriaAvatar size={30} className="mt-0.5" />
      ) : (
        <UserAvatar uri={avatarUri} name={name} size={30} className="mt-0.5" />
      )}
      <View
        className={cn(
          'flex-1 rounded-2xl px-4 py-3',
          isAria ? 'rounded-tl-md bg-accent-soft' : 'rounded-tr-md bg-surface border border-border',
        )}>
        {typeof children === 'string' ? (
          <Text variant="body" className="leading-6">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </Animated.View>
  );
}
