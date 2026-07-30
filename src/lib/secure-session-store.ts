import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the Supabase session lives.
 *
 * Previously AsyncStorage, which is plaintext on disk. The refresh token *is*
 * the identity RLS trusts, so anyone who can read the app's sandbox — a rooted
 * device, an unencrypted backup, a forensic extraction — could mint access
 * tokens for that account. The keychain (iOS) and Keystore-backed store
 * (Android) encrypt it at rest instead.
 *
 * Two things this has to get right or people lose access to their own accounts:
 *
 *  1. Chunking. SecureStore's Android backing store is unreliable above ~2KB per
 *     value, and a Supabase session with two JWTs can exceed that. Values are
 *     split across numbered keys with a small index written last.
 *  2. Never hard-fail. If the secure store is unavailable for any reason, this
 *     falls back to AsyncStorage rather than throwing. A slightly weaker store
 *     beats an app nobody can sign in to.
 */

const CHUNK = 1800; // headroom under the ~2KB practical ceiling
const indexKey = (key: string) => `${key}.__chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

/**
 * Split a value for storage. Exported because reassembly is the one part of
 * this file that can silently corrupt a session, so it is unit-tested directly
 * rather than trusted: `joinParts(splitValue(x)) === x` must hold for every x.
 */
export function splitValue(value: string, size = CHUNK): string[] {
  if (value.length <= size) return [value];
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts;
}

export function joinParts(parts: string[]): string {
  return parts.join('');
}

// Only the two mobile platforms have a secure store; on web there is none.
const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

async function secureGet(key: string): Promise<string | null> {
  const count = Number((await SecureStore.getItemAsync(indexKey(key))) ?? '0');
  if (!count) return SecureStore.getItemAsync(key);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    // A missing chunk means a torn write: treat the whole value as absent
    // rather than handing Supabase a truncated session it can't parse.
    if (part == null) return null;
    parts.push(part);
  }
  return joinParts(parts);
}

async function secureSet(key: string, value: string): Promise<void> {
  await secureClear(key);
  if (value.length <= CHUNK) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  const parts = splitValue(value);
  for (let i = 0; i < parts.length; i += 1) await SecureStore.setItemAsync(chunkKey(key, i), parts[i]);
  // Index last, so a crash mid-write leaves no index and the value reads as
  // absent rather than as a partial session.
  await SecureStore.setItemAsync(indexKey(key), String(parts.length));
}

async function secureClear(key: string): Promise<void> {
  const count = Number((await SecureStore.getItemAsync(indexKey(key))) ?? '0');
  await SecureStore.deleteItemAsync(indexKey(key)).catch(() => {});
  await SecureStore.deleteItemAsync(key).catch(() => {});
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
  }
}

export const secureSessionStore = {
  async getItem(key: string): Promise<string | null> {
    if (!secureAvailable) return AsyncStorage.getItem(key);
    try {
      const found = await secureGet(key);
      if (found != null) return found;

      // One-time migration: move an existing plaintext session across so
      // upgrading doesn't sign everyone out, then remove the plaintext copy.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        await secureSet(key, legacy);
        await AsyncStorage.removeItem(key);
        return legacy;
      }
      return null;
    } catch (err) {
      console.warn('[aria] secure session read failed, using async storage:', err);
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!secureAvailable) return AsyncStorage.setItem(key, value);
    try {
      await secureSet(key, value);
    } catch (err) {
      console.warn('[aria] secure session write failed, using async storage:', err);
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (!secureAvailable) return AsyncStorage.removeItem(key);
    try {
      await secureClear(key);
    } catch (err) {
      console.warn('[aria] secure session clear failed:', err);
    }
    // Always clear the legacy copy too, so signing out leaves nothing behind.
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};
