import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useColors } from '@/lib/colors';
import { Text } from '@/components/ui/text';

/**
 * A card of related rows, with an optional heading above and explanation below.
 *
 * `footnote` is where a toggle's explanation belongs. Inside the row it has to
 * share the line with the switch, so it wraps into a narrow column and reads
 * badly; below the card it gets the full width, which is how the platform's own
 * settings do it.
 */
export function SettingsGroup({
  title,
  footnote,
  children,
}: {
  title?: string;
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      {/* No horizontal padding on either: the card runs flush to the screen's
          gutter, so a few pixels of inset here reads as a misalignment rather
          than as deliberate indentation. */}
      {title ? (
        <Text variant="label" tone="muted">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</View>
      {/* 15px: the second line in that same list row, one step below the title
          and clearly its supporting text. */}
      {footnote ? (
        <Text variant="small" tone="faint" className="text-[14px] font-normal leading-[20px]">
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A single row: icon, label, and whatever control sits on the right.
 *
 * Prefer the group's `footnote` for explanations — below the card, full width,
 * clear of whatever the right-hand control occupies. `description` is the
 * exception, for a row whose text is meant to sit inside the box with it; it
 * only works when the right side holds something narrow, like a single glyph.
 */
export function SettingsRow({
  icon: Icon,
  iconColor,
  label,
  description,
  right,
  onPress,
  showChevron,
  first,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  first?: boolean;
}) {
  const c = useColors();
  const content = (
    <View className={cn('flex-row items-center gap-3 px-4 py-3.5', !first && 'border-t border-border')}>
      {Icon ? (
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-bg">
          <Icon size={17} color={iconColor ?? c.muted} />
        </View>
      ) : null}
      {/* 16px regular. Size and colour carry the hierarchy against the 14px
          muted description, so weight isn't needed as well. */}
      <View className="flex-1">
        <Text variant="body" className="text-[16px] font-normal leading-[23px]">
          {label}
        </Text>
        {/* Same 15px muted treatment as a footnote, so a description reads the
            same whether it sits inside the box or under it. */}
        {description ? (
          <Text
            variant="small"
            tone="faint"
            className="mt-0.5 text-[14px] font-normal leading-[20px]">
            {description}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <ChevronRight size={18} color={c.faint} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:bg-border/30">
        {content}
      </Pressable>
    );
  }
  return content;
}
