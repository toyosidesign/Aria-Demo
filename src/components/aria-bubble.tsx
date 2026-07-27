import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { AriaAvatar } from './aria-avatar';
import { Text } from './ui/text';

/** A chat bubble in the Aria flow — from Aria (left) or Maya (right). */
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
  return (
    <Animated.View
      entering={FadeInDown.duration(280).springify().damping(18)}
      className={cn('flex-row gap-2.5', isAria ? 'pr-8' : 'flex-row-reverse pl-8', className)}>
      {isAria ? <AriaAvatar size={30} className="mt-0.5" /> : null}
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
