/**
 * RFC-4122 v4 UUID (Math.random-based — no native crypto dependency, so it
 * works everywhere incl. Expo Go). Used for ids that map to Postgres `uuid`
 * columns, generated client-side for optimistic local-first writes.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
