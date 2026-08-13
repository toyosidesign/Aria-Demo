import { router, type Href } from 'expo-router';

import { capabilityFor, type ActionId } from '@/lib/capabilities';
import { THEME_NAMES } from '@/lib/themes';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Carrying out one thing Aria offered to do.
 *
 * ── Why the model does not do any of this ───────────────────────────────────
 *
 * It picks an id from `lib/capabilities.ts` and a value. Everything that
 * actually happens happens here, in code, after a tap. So an invented
 * capability finds no branch and says so, a value of the wrong shape is
 * rejected rather than written, and nothing at all runs from a sentence that
 * merely sounded like a request.
 *
 * ── Why some of these navigate instead of acting ────────────────────────────
 *
 * "Set up an assignment" cannot be finished from a chat message: it needs a
 * title, and then a plan, and then the work. Aria opening the screen with the
 * category already chosen is the honest version of doing it, and it is where
 * the flow already lives. Anything that *is* one value, a name, a theme, a
 * switch, is applied outright.
 */

export interface OfferedAction {
  id: string;
  /** What the person typed or Aria proposed, when the action needs a value. */
  value?: string;
}

export interface ActionResult {
  ok: boolean;
  /** What to say afterwards, in Aria's voice. Shown as a message, not a toast. */
  note: string;
}

/** "on", "off", "yes", "no": the ways somebody says a switch out loud. */
function asBool(value: string | undefined): boolean | null {
  const v = (value ?? '').trim().toLowerCase();
  if (['on', 'yes', 'true', 'enable', 'enabled'].includes(v)) return true;
  if (['off', 'no', 'false', 'disable', 'disabled'].includes(v)) return false;
  return null;
}

/** HH:mm, and nothing that merely looks like it. */
function asTime(value: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function runAction(action: OfferedAction): ActionResult {
  const cap = capabilityFor(action.id);
  if (!cap) {
    // The model named something this app cannot do. Saying so is the whole
    // point of the whitelist: the alternative is a button that does nothing.
    return { ok: false, note: 'That is not something I can do in here yet.' };
  }

  const store = useAriaStore.getState();
  const id = cap.id as ActionId;

  // Pro-only, refused kindly rather than silently ignored.
  if (cap.pro && !store.pro) {
    return {
      ok: false,
      note: `${cap.label} is part of Pro. Turn Pro on in settings and I will set it up.`,
    };
  }

  switch (id) {
    case 'create.assignment':
    case 'create.project':
    case 'create.event':
    case 'create.reminder': {
      const kind = id.split('.')[1];
      const title = action.value?.trim();
      router.push(
        `/task/new?kind=${kind}${title ? `&title=${encodeURIComponent(title)}` : ''}` as Href,
      );
      return { ok: true, note: `Opening a new ${kind === 'create' ? 'task' : kind}.` };
    }

    case 'profile.name': {
      const name = action.value?.trim();
      if (!name) return { ok: false, note: 'Tell me the name and I will change it.' };
      store.updateProfile({ name });
      return { ok: true, note: `Done. I will write as ${name} from now on.` };
    }

    case 'profile.context': {
      const context = action.value?.trim();
      if (!context) return { ok: false, note: 'Tell me what you study or do, and I will keep it.' };
      store.updateProfile({ context });
      return { ok: true, note: `Noted: ${context}. I will write with that in mind.` };
    }

    case 'settings.theme': {
      const theme = (action.value ?? '').trim().toLowerCase();
      const known = ['system', ...THEME_NAMES];
      if (!known.includes(theme)) {
        return { ok: false, note: `I have ${known.join(', ')}. Which would you like?` };
      }
      store.setSetting('theme', theme as never);
      return { ok: true, note: `Switched to ${theme}.` };
    }

    case 'settings.notifications':
    case 'settings.haptics':
    case 'settings.proactive':
    case 'settings.dailyReview':
    case 'settings.sampleData':
    case 'settings.pro': {
      const on = asBool(action.value);
      if (on === null) return { ok: false, note: 'On or off?' };
      if (id === 'settings.pro') {
        store.setPro(on);
        return { ok: true, note: on ? 'Pro is on.' : 'Pro is off.' };
      }
      if (id === 'settings.sampleData') {
        store.setSampleData(on);
        return { ok: true, note: on ? 'Sample tasks are in.' : 'Sample tasks cleared.' };
      }
      const key =
        id === 'settings.notifications'
          ? 'notifications'
          : id === 'settings.haptics'
            ? 'haptics'
            : id === 'settings.proactive'
              ? 'proactiveAria'
              : 'dailyReview';
      store.setSetting(key, on as never);
      return { ok: true, note: `${cap.label.replace(/^Turn /, '')}: ${on ? 'on' : 'off'}.` };
    }

    case 'settings.reviewTime': {
      const time = asTime(action.value);
      if (!time) return { ok: false, note: 'What time? Something like 08:30.' };
      store.setSetting('reviewTime', time as never);
      return { ok: true, note: `I will check in at ${time}.` };
    }

    case 'open.tasks':
    case 'open.calendar':
    case 'open.activity':
    case 'open.review':
    case 'open.settings':
    case 'open.profile': {
      const where: Record<string, string> = {
        'open.tasks': '/(tabs)/tasks',
        'open.calendar': '/(tabs)/calendar',
        'open.activity': '/activity',
        'open.review': '/review',
        'open.settings': '/(tabs)/settings',
        'open.profile': '/profile/edit',
      };
      router.push(where[id] as Href);
      return { ok: true, note: 'Opening it now.' };
    }
  }
}

/** Say it out loud as well, for the ones that change something invisible. */
export function announce(result: ActionResult) {
  if (result.ok) showToast(result.note, 'check');
}
