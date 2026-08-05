import { UserRound } from 'lucide-react-native';
import { Image, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';

/**
 * Maya's own face, her picture when she's set one, a neutral avatar when she
 * hasn't. `solid` matches the filled accent disc used in the Today header.
 */
export function UserAvatar({
  uri,
  name,
  size = 40,
  solid = false,
  className,
}: {
  uri?: string;
  name?: string;
  size?: number;
  solid?: boolean;
  className?: string;
}) {
  const c = useColors();
  const dimensions = { width: size, height: size, borderRadius: size / 2 };
  const label = name ? `${name}'s profile picture` : 'Profile picture';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={label}
        accessibilityIgnoresInvertColors
        style={dimensions}
        className={cn('bg-accent-soft', className)}
      />
    );
  }

  return (
    <View
      accessibilityLabel={label}
      className={cn(
        'items-center justify-center rounded-full',
        solid ? 'bg-accent' : 'bg-accent-soft',
        className,
      )}
      style={dimensions}>
      <UserRound
        size={Math.round(size * 0.52)}
        color={solid ? c.accentInk : c.accent}
        strokeWidth={2}
      />
    </View>
  );
}
