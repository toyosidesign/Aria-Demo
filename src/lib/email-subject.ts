/**
 * Building an email subject line.
 *
 * Deliberately its own module with no imports. It used to live in lib/send.ts,
 * which pulls in react-native and expo-clipboard, so the logic could not be
 * tested outside a native runtime, and this is exactly the kind of pure string
 * handling that wants asserting directly.
 */

/**
 * Collapse anything that would break a single-line field.
 *
 * A subject *is* one header line, so a line break in it is never meaningful , 
 * but a task title can contain one (pasted, or written by the model), and
 * `.trim()` only touches the ends. Left alone that newline reaches
 * SendEmailSchema, which refuses it, and the send fails with a 400 the user
 * only ever sees as "couldn't send".
 *
 * Normalising here rather than loosening the schema keeps the guarantee at the
 * boundary and fixes the cause: whoever produces a subject owes a single line.
 */
export const normaliseSubject = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Subject line for an email Aria drafted. Always a single line. */
export function emailSubject(title: string, kind: string): string {
  if (kind === 'birthday') return 'Happy birthday!';
  if (kind === 'anniversary') return 'Happy anniversary!';
  return normaliseSubject(title);
}
