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
 * Open the system contact picker and return the chosen person.
 *
 * The native picker is deliberately preferred over reading the whole address
 * book: on iOS it hands back just the one contact the user tapped, so Aria
 * never needs blanket access to everyone they know.
 */
export async function pickPhoneContact(): Promise<PickedContact | null> {
  const C = getContacts();
  if (!C) {
    showToast('Contacts need a device');
    return null;
  }

  try {
    if (!(await C.isAvailableAsync())) {
      showToast('No contacts available on this device');
      return null;
    }

    const contact = await C.presentContactPickerAsync();
    if (!contact) return null; // dismissed

    const name =
      contact.name?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
    if (!name) {
      showToast('That contact has no name');
      return null;
    }

    return {
      name,
      email: pickPrimary(contact.emails)?.email?.trim() || undefined,
      phone: pickPrimary(contact.phoneNumbers)?.number?.trim() || undefined,
      imageUri: contact.image?.uri,
    };
  } catch {
    showToast("Couldn't open your contacts");
    return null;
  }
}

/** The entry marked primary, else the first one. */
function pickPrimary<T extends { isPrimary?: boolean }>(list: T[] | undefined): T | undefined {
  if (!list?.length) return undefined;
  return list.find((e) => e.isPrimary) ?? list[0];
}
