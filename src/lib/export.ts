import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import { showToast } from '@/lib/toast';

/**
 * Getting written work out of Aria.
 *
 * Everything goes through the phone's own share sheet rather than talking to
 * any one service. That is what puts Notes, Files, Google Drive, Docs and Mail
 * in front of the user in a single tap, without Aria holding an account, an
 * OAuth token or a per-service integration for any of them, and it means
 * whichever apps someone actually has installed are the ones they're offered.
 *
 * Two routes, tried in order, because they reach different places:
 *  - a real .txt file, which is what "Save to Files" and Google Drive/Docs need
 *  - plain text, which is what Notes and Mail prefer, and the only option when
 *    the filesystem or share module isn't there (web, or a bare simulator)
 *
 * Work a student has done should never be trapped in the app, so the last
 * resort is the clipboard rather than reporting that nothing happened.
 */

export type ExportResult = 'shared' | 'dismissed' | 'copied';

// Lazy-required like the app's other native modules, so the web/Node server
// render never loads them.
const native = Platform.OS === 'ios' || Platform.OS === 'android';

type FileSystemModule = typeof import('expo-file-system');
type SharingModule = typeof import('expo-sharing');

let fs: FileSystemModule | null = null;
function getFS(): FileSystemModule | null {
  if (!native) return null;
  if (!fs) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      fs = require('expo-file-system') as FileSystemModule;
    } catch {
      return null;
    }
  }
  return fs;
}

let sharing: SharingModule | null = null;
function getSharing(): SharingModule | null {
  if (!native) return null;
  if (!sharing) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sharing = require('expo-sharing') as SharingModule;
    } catch {
      return null;
    }
  }
  return sharing;
}

/** Markdown-ish plain text: headings survive a paste into Docs or Notes. */
export function sectionsToText(sections: { title: string; content: string }[]): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => `${s.title}\n\n${s.content.trim()}`)
    .join('\n\n---\n\n');
}

/**
 * A file name the user will recognise in Files a week later.
 *
 * Punctuation is stripped rather than escaped, because a stray slash or colon
 * in a task title is a path, not a character, on at least one of the two
 * platforms. `.txt` rather than `.md`: Files, Drive and Docs all accept it
 * without argument, and the headings read fine either way.
 */
function fileNameFor(title: string): string {
  const base =
    title
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Aria notes';
  return `${base}.txt`;
}

/** Write a real file and offer it, so "Save to Files" and Drive are options. */
async function shareAsFile(title: string, text: string): Promise<boolean> {
  const FS = getFS();
  const Sharing = getSharing();
  if (!FS || !Sharing) return false;
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const file = new FS.File(FS.Paths.cache, fileNameFor(title));
    // Overwrite rather than delete-then-create: exporting the same task twice
    // is normal, and a stale file left behind would be shared instead.
    file.create({ overwrite: true, intermediates: true });
    file.write(text);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      UTI: 'public.plain-text',
      dialogTitle: `Save “${title}”`,
    });
    return true;
  } catch {
    return false;
  }
}

/** Offer the text itself, which is what Notes and Mail actually want. */
async function shareAsText(title: string, text: string): Promise<ExportResult | null> {
  try {
    const result = await Share.share({ message: text, title }, { dialogTitle: `Save “${title}”` });
    return result.action === Share.sharedAction ? 'shared' : 'dismissed';
  } catch {
    return null;
  }
}

/**
 * Offer a piece of work to whatever the phone can open it with.
 *
 * `title` leads the exported text as well as naming the sheet, because most
 * targets keep only the body, and an untitled note is unfindable a week later.
 */
export async function exportWork(title: string, body: string): Promise<ExportResult> {
  const trimmed = body.trim();
  if (!trimmed) {
    showToast('Nothing to save yet');
    return 'dismissed';
  }
  const text = `${title}\n\n${trimmed}\n`;

  if (await shareAsFile(title, text)) return 'shared';

  const viaText = await shareAsText(title, text);
  if (viaText) return viaText;

  try {
    await Clipboard.setStringAsync(text);
  } catch {
    /* best effort */
  }
  showToast("Couldn't open the share sheet, copied instead", 'check');
  return 'copied';
}
