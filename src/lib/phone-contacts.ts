import { Platform } from 'react-native';

import { showToast } from '@/lib/toast';

/**
 * The user's own address book. Lazy-required like the notifications module so
 * it never loads during the web/Node server render, where the native module's
 * import would crash.
 */
type ContactsModule = typeof import('expo-contacts');

const native = Platform.OS === 'ios' || Platform.OS === 'android';
let mod: ContactsModule | null = null;

function getContacts(): ContactsModule | null {
  if (!native) return null;
  if (!mod) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require('expo-contacts') as ContactsModule;
    } catch {
      return null;
    }
  }
  return mod;
}

export interface PickedContact {
  name: string;
  email?: string;
  phone?: string;
  /** The contact's own photo, when they have one. */
  imageUri?: string;
}

/** True when this build can reach the address book at all. */
export function phoneContactsAvailable(): boolean {
  return !!getContacts();
}

/**
 * Why no contact came back, when none did.
 *
 * The picker used to answer `null` to every question, cancelled, denied,
 * unavailable, nameless, and every caller treated all four as "they changed
 * their mind" and left the form untouched. On Android, where the picker needs
 * `READ_CONTACTS`, that made a refused permission look exactly like a dead
 * button: tap, nothing, tap again, still nothing, no way to find out why.
 *
 * So the reason is part of the answer now, and the caller says the true thing.
 */
export type ContactPick =
  | { status: 'picked'; contact: PickedContact }
  | { status: 'cancelled' }
  /** Refused. `canAskAgain` false means only Settings can undo it. */
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable' }
  /** Something went wrong the caller can only report, in words it can show. */
  | { status: 'error'; message: string };

/**
 * Open the system contact picker and say what came of it.
 *
 * The native picker is deliberately preferred over reading the whole address
 * book: on iOS it hands back just the one contact the user tapped, so Aria
 * never needs blanket access to everyone they know.
 */
export async function pickPhoneContactResult(): Promise<ContactPick> {
  const C = getContacts();
  if (!C) return { status: 'unavailable' };

  try {
    if (!(await C.isAvailableAsync())) return { status: 'unavailable' };

    /*
     * Android only, and asked for rather than assumed.
     *
     * `presentContactPickerAsync` needs `READ_CONTACTS` there and nothing in
     * the app had ever requested it, so the picker failed before it opened. iOS
     * needs no permission for this picker at all, the whole point of it, so
     * prompting there would be asking for access Aria does not use.
     */
    if (Platform.OS === 'android') {
      let perm = await C.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await C.requestPermissionsAsync();
      if (!perm.granted) return { status: 'denied', canAskAgain: perm.canAskAgain };
    }

    const contact = await C.presentContactPickerAsync();
    if (!contact) return { status: 'cancelled' };

    const name =
      contact.name?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
    if (!name) return { status: 'error', message: 'That contact has no name' };

    return {
      status: 'picked',
      contact: {
        name,
        email: pickPrimary(contact.emails)?.email?.trim() || undefined,
        phone: pickPrimary(contact.phoneNumbers)?.number?.trim() || undefined,
        imageUri: contact.image?.uri,
      },
    };
  } catch {
    return { status: 'error', message: "Couldn't open your contacts" };
  }
}

/**
 * The chosen person, or null.
 *
 * Kept for callers that have somewhere of their own to explain a failure , 
 * they use `pickPhoneContactResult`, and for those that do not, which is why
 * this one still toasts. Silence was the bug.
 */
export async function pickPhoneContact(): Promise<PickedContact | null> {
  const result = await pickPhoneContactResult();
  if (result.status === 'picked') return result.contact;
  if (result.status === 'unavailable') showToast('Contacts need a device');
  if (result.status === 'denied') showToast('Aria needs permission to open your contacts');
  if (result.status === 'error') showToast(result.message);
  return null;
}

/** The entry marked primary, else the first one. */
function pickPrimary<T extends { isPrimary?: boolean }>(list: T[] | undefined): T | undefined {
  if (!list?.length) return undefined;
  return list.find((e) => e.isPrimary) ?? list[0];
}
