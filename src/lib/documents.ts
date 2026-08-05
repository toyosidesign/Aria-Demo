/**
 * Getting a brief off the phone and into Aria.
 *
 * A brief arrives as a PDF on a VLE, a photo of a handout, or a paragraph
 * someone pasted into a group chat. All three are supported and the first is
 * the primary one, because it is the form the actual document takes.
 *
 * ── Why base64, and why a size cap ──────────────────────────────────────────
 *
 * The file is read on the device and posted as base64 to `/api/brief`, which
 * hands it to the model as a document block. There is no upload bucket and
 * nothing is stored server-side: the bytes exist for one request. That is the
 * cheapest way to keep a student's coursework out of somewhere it would then
 * have to be protected.
 *
 * Base64 is a third bigger than the file, and the whole thing sits in memory
 * twice on the way out, so the cap is real rather than defensive: a 40MB scan
 * of a handbook would be an out-of-memory crash on an older phone and a bill on
 * arrival. Rejected loudly, with the reason, rather than failing at the API.
 */

import { Platform } from 'react-native';

import { showToast } from '@/lib/toast';

type DocumentPickerModule = typeof import('expo-document-picker');
type FileSystemModule = typeof import('expo-file-system');

const native = Platform.OS === 'ios' || Platform.OS === 'android';

let picker: DocumentPickerModule | null = null;
function getPicker(): DocumentPickerModule | null {
  if (!native) return null;
  if (!picker) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      picker = require('expo-document-picker') as DocumentPickerModule;
    } catch {
      return null;
    }
  }
  return picker;
}

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

export function documentsAvailable(): boolean {
  return !!getPicker();
}

/** 6MB of actual file. Roughly 8MB once encoded, which the route caps at 10. */
export const MAX_BRIEF_BYTES = 6 * 1024 * 1024;

/**
 * What the model can actually read.
 *
 * PDFs and images go straight through as document and image blocks. A .docx is
 * a zip of XML and arrives as bytes nothing here can open — so it is refused by
 * name, with the two things that do work, rather than uploaded and silently
 * extracted as gibberish.
 */
const READABLE = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];

export interface PickedDocument {
  name: string;
  mediaType: string;
  /** Base64, no `data:` prefix. */
  data: string;
  /** Plain text, when the file was text and needed no model to read it. */
  text?: string;
}

export type DocumentPick =
  | { status: 'picked'; document: PickedDocument }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/**
 * Open the file picker and read whatever comes back.
 *
 * Same shape as `pickPhoneContactResult`, and for the same reason: a cancel and
 * a failure both used to look like nothing happening, and the button reads as
 * dead. The caller decides what to say; this only decides what is true.
 */
export async function pickBriefDocument(): Promise<DocumentPick> {
  const DP = getPicker();
  const FS = getFS();
  if (!DP || !FS) return { status: 'unavailable' };

  try {
    const result = await DP.getDocumentAsync({
      // Copied into the cache first. Without it, iOS hands back a URL into the
      // Files provider that is revoked the moment the picker closes, so the
      // read below fails on exactly the documents someone stores in iCloud.
      copyToCacheDirectory: true,
      type: READABLE,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return { status: 'cancelled' };

    const asset = result.assets[0];
    const mediaType = asset.mimeType ?? guessType(asset.name);
    if (!READABLE.includes(mediaType)) {
      return { status: 'error', message: 'I can read a PDF, an image or plain text' };
    }
    if (typeof asset.size === 'number' && asset.size > MAX_BRIEF_BYTES) {
      return { status: 'error', message: 'That file is too big — 6MB is the limit' };
    }

    const file = new FS.File(asset.uri);
    // Text needs no model to read it, and sending it as text rather than as a
    // document block is both cheaper and more accurate.
    if (mediaType === 'text/plain') {
      const text = await file.text();
      return {
        status: 'picked',
        document: { name: asset.name, mediaType, data: '', text },
      };
    }
    const data = await file.base64();
    if (!data) return { status: 'error', message: "That file came back empty" };
    return { status: 'picked', document: { name: asset.name, mediaType, data } };
  } catch {
    return { status: 'error', message: "Couldn't open that file" };
  }
}

/** Last resort when the picker reports no MIME type, which Android does. */
function guessType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'txt' || ext === 'md') return 'text/plain';
  return 'application/octet-stream';
}

/** A photo of a handout, read the same way a picked file is. */
export async function readImageAsDocument(uri: string, name = 'Photo of the brief'): Promise<PickedDocument | null> {
  const FS = getFS();
  if (!FS) return null;
  try {
    const file = new FS.File(uri);
    const data = await file.base64();
    if (!data) return null;
    return { name, mediaType: guessType(uri) === 'image/png' ? 'image/png' : 'image/jpeg', data };
  } catch {
    showToast("Couldn't read that photo");
    return null;
  }
}
