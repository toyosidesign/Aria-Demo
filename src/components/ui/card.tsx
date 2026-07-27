import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

export interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ className, padded = true, ...props }: CardProps) {
  return (
    <View
      className={cn('rounded-2xl border border-border bg-surface', padded && 'p-4', className)}
      {...props}
    />
  );
}
