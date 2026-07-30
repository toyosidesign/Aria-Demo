import type { TaskKind } from '@/store/aria-store';

/**
 * Card templates.
 *
 * A "card" here is a formatted message rather than an image: it has to survive
 * being pasted into Mail or WhatsApp as plain text, which is the only way it
 * can actually reach anyone. So each template is a little banner of characters
 * plus an opening line Aria writes the rest around.
 */

export type CardOccasion =
  | 'birthday'
  | 'anniversary'
  | 'congrats'
  | 'thanks'
  | 'thinking'
  | 'getwell'
  | 'goodluck'
  | 'sorry';

export interface CardTemplate {
  id: string;
  name: string;
  occasion: CardOccasion;
  /** The banner that heads the message. */
  art: string;
  /** Opening line; `{name}` is replaced with the recipient. */
  opener: string;
  /** Preview tint, so the picker reads as a row of cards rather than a list. */
  tint: string;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  // --- Birthday ---
  {
    id: 'birthday-balloons',
    name: 'Balloons',
    occasion: 'birthday',
    art: '🎈  🎂  🎈',
    opener: 'Happy birthday, {name}!',
    tint: '#F472B6',
  },
  {
    id: 'birthday-confetti',
    name: 'Confetti',
    occasion: 'birthday',
    art: '🎉 ✨ 🎊 ✨ 🎉',
    opener: 'Happy birthday, {name}! 🎉',
    tint: '#FBBF24',
  },
  {
    id: 'birthday-cake',
    name: 'Make a wish',
    occasion: 'birthday',
    art: '🕯️ 🎂 🕯️',
    opener: 'Make a wish, {name}!',
    tint: '#FB923C',
  },
  {
    id: 'birthday-simple',
    name: 'Understated',
    occasion: 'birthday',
    art: '🎂',
    opener: 'Happy birthday, {name}.',
    tint: '#60A5FA',
  },

  // --- Anniversary & love ---
  {
    id: 'anniversary-hearts',
    name: 'Hearts',
    occasion: 'anniversary',
    art: '💛  💛  💛',
    opener: 'Happy anniversary, {name}!',
    tint: '#F87171',
  },
  {
    id: 'anniversary-rings',
    name: 'Together',
    occasion: 'anniversary',
    art: '💍  ∞  💍',
    opener: 'Happy anniversary, {name}.',
    tint: '#E879F9',
  },

  // --- Congratulations ---
  {
    id: 'congrats-stars',
    name: 'Congratulations',
    occasion: 'congrats',
    art: '⭐️  🌟  ⭐️',
    opener: 'Congratulations, {name}!',
    tint: '#34D399',
  },
  {
    id: 'congrats-fizz',
    name: 'Celebrate',
    occasion: 'congrats',
    art: '🥂  🍾  🥂',
    opener: 'Congratulations, {name}! Well deserved.',
    tint: '#FACC15',
  },
  {
    id: 'congrats-newjob',
    name: 'New job',
    occasion: 'congrats',
    art: '💼  ✨',
    opener: 'Congratulations on the new job, {name}!',
    tint: '#38BDF8',
  },

  // --- Good luck ---
  {
    id: 'goodluck-clover',
    name: 'Good luck',
    occasion: 'goodluck',
    art: '🍀  🤞  🍀',
    opener: 'Good luck, {name}!',
    tint: '#4ADE80',
  },
  {
    id: 'goodluck-exams',
    name: 'Exams',
    occasion: 'goodluck',
    art: '📚  ✏️  💪',
    opener: 'You’ve got this, {name}.',
    tint: '#818CF8',
  },

  // --- Get well ---
  {
    id: 'getwell-soon',
    name: 'Get well soon',
    occasion: 'getwell',
    art: '🌷  ☕️  🌷',
    opener: 'Get well soon, {name}.',
    tint: '#5EEAD4',
  },

  // --- Thanks & thinking of you ---
  {
    id: 'thanks-simple',
    name: 'Thank you',
    occasion: 'thanks',
    art: '🌿',
    opener: 'Thank you, {name}.',
    tint: '#A78BFA',
  },
  {
    id: 'thanks-flowers',
    name: 'So grateful',
    occasion: 'thanks',
    art: '💐  ✨  💐',
    opener: 'Thank you so much, {name}.',
    tint: '#F9A8D4',
  },
  {
    id: 'thinking-of-you',
    name: 'Thinking of you',
    occasion: 'thinking',
    art: '☁️  ☀️',
    opener: 'Thinking of you, {name}.',
    tint: '#38BDF8',
  },
  {
    id: 'sorry-simple',
    name: 'Sorry',
    occasion: 'sorry',
    art: '🌾',
    opener: 'I’m sorry, {name}.',
    tint: '#94A3B8',
  },
];

export function cardTemplate(id?: string): CardTemplate | undefined {
  return id ? CARD_TEMPLATES.find((t) => t.id === id) : undefined;
}

/** Templates worth showing first for a given kind of task. */
export function templatesFor(kind: TaskKind): CardTemplate[] {
  const preferred: CardOccasion | null =
    kind === 'birthday' ? 'birthday' : kind === 'anniversary' ? 'anniversary' : null;
  if (!preferred) return CARD_TEMPLATES;
  return [
    ...CARD_TEMPLATES.filter((t) => t.occasion === preferred),
    ...CARD_TEMPLATES.filter((t) => t.occasion !== preferred),
  ];
}

/** The default template for a task, so a card is never blank. */
export function defaultTemplateFor(kind: TaskKind): CardTemplate {
  return templatesFor(kind)[0];
}

/** Lay the card out as sendable text: banner, greeting, message, sign-off. */
export function renderCard({
  template,
  toName,
  body,
  fromName,
}: {
  template: CardTemplate;
  toName?: string;
  body: string;
  fromName?: string;
}): string {
  const opener = template.opener.replace('{name}', toName?.trim() || 'there');
  const lines = [template.art, '', opener, '', body.trim()];
  if (fromName?.trim()) lines.push('', fromName.trim());
  return lines.join('\n');
}
