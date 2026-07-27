import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

export interface ScreenProps extends ViewProps {
  edges?: Edge[];
  padded?: boolean;
}

/** Full-bleed themed background + safe-area wrapper for a screen. */
export function Screen({
  className,
  children,
  edges = ['top'],
  padded = false,
  ...props
}: ScreenProps) {
  return (
    <View className="flex-1 bg-bg" {...props}>
      <SafeAreaView edges={edges} className={cn('flex-1', padded && 'px-5')}>
        {children}
      </SafeAreaView>
    </View>
  );
}
