import {
  BookOpen,
  Bell,
  Cake,
  CalendarClock,
  ClipboardList,
  FolderKanban,
  Heart,
  type LucideIcon,
} from 'lucide-react-native';

import type { TaskKind } from '@/store/aria-store';

export const KIND_ICON: Record<TaskKind, LucideIcon> = {
  general: ClipboardList,
  reminder: Bell,
  event: CalendarClock,
  birthday: Cake,
  anniversary: Heart,
  assignment: BookOpen,
  project: FolderKanban,
};
