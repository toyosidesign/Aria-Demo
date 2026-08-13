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
/**
 * The same work as a document a word processor will open.
 *
 * ── Why RTF and not .docx ───────────────────────────────────────────────────
 *
 * A .txt file is what a note is, and what an essay is not: it has no headings,
 * no paragraphs a marker can comment on, and it opens in a text editor rather
 * than in the thing somebody is going to submit from. A .docx is a zip of XML
 * and needs a library that has to run inside React Native.
 *
 * RTF is neither. It is plain text with markup, so it is a few lines of string
 * building and no dependency at all, and Word, Pages and Google Docs all open
 * it and save straight back out as .docx. For a student that is the whole
 * difference: the file arrives as a document they can hand in rather than as
 * something they have to retype.
 */
function rtf(text: string): string {
  return (
    text
      // Backslash and braces are RTF's own syntax, so they go first or the
      // escapes below get escaped in turn.
      .replace(/[\\{}]/g, (m) => `\\${m}`)
      // Anything outside ASCII becomes a numeric escape. A curly quote or an
      // accented name left raw renders as mojibake in Word, which looks like
      // Aria cannot spell.
      .replace(/[^\x00-\x7F]/g, (ch) => `\\u${ch.charCodeAt(0)}?`)
      .replace(/\n/g, '\\par ')
  );
}

export async function exportDocument(opts: {
  /** Without an extension: this adds its own. */
  name: string;
  title: string;
  author?: string;
  sections: { title: string; content: string }[];
}): Promise<ExportResult> {
  const body = opts.sections
    .filter((sec) => sec.content.trim())
    .map((sec) => `{\\b\\fs28 ${rtf(sec.title)}}\\par\\par ${rtf(sec.content.trim())}\\par\\par `)
    .join('');

  if (!body) {
    showToast('Nothing to save yet');
    return 'dismissed';
  }

  const doc =
    `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\fs24 ` +
    `{\\b\\fs36 ${rtf(opts.title)}}\\par ` +
    (opts.author ? `${rtf(opts.author)}\\par ` : '') +
    `\\par ${body}}`;

  const FS = getFS();
  const Sharing = getSharing();
  if (FS && Sharing) {
    try {
      if (await Sharing.isAvailableAsync()) {
        const file = new FS.File(FS.Paths.cache, `${fileNameFor(opts.name).replace(/\.txt$/, '')}.rtf`);
        file.create({ overwrite: true, intermediates: true });
        file.write(doc);
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/rtf',
          UTI: 'public.rtf',
          dialogTitle: `Save “${opts.title}”`,
        });
        return 'shared';
      }
    } catch {
      /* falls through to the plain-text paths below */
    }
  }

  /*
   * No share sheet, so the text itself.
   *
   * A document nobody can open is worse than a paragraph they can paste, and
   * this is the same ladder `exportWork` already climbs: file, then text, then
   * clipboard. Losing the formatting is the right thing to lose.
   */
  return exportWork(
    opts.title,
    opts.sections.map((sec) => `${sec.title}\n\n${sec.content.trim()}`).join('\n\n'),
  );
}

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
