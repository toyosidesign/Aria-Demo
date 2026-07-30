import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Contact } from '@/lib/contacts';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  DraftSection,
  Profile,
  Settings,
  Subtask,
  Task,
  TaskKind,
  TaskMethod,
  Priority,
  TaskStatus,
} from '@/store/aria-store';

const SETTINGS_DEFAULTS: Settings = {
  theme: 'system',
  biometricLock: false,
  proactiveAria: true,
  haptics: true,
  notifications: true,
};

// ---------------------------------------------------------------------------
// Current user — set by the auth layer so writes know the owner.
// ---------------------------------------------------------------------------
let currentUserId: string | null = null;
export function setSyncUser(id: string | null) {
  currentUserId = id;
}

// ---------------------------------------------------------------------------
// Row shapes (snake_case, as stored in Postgres)
// ---------------------------------------------------------------------------
interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  priority: string;
  kind: string;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  method: string | null;
  card_template_id: string | null;
  photo_uri: string | null;
  subtasks: Subtask[];
  draft_sections: DraftSection[];
  handled_by_aria: boolean | null;
  alarm: boolean | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}
interface ContactRow {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  context: string | null;
  // Kept only so an existing row can be migrated, never written again.
  school: string | null;
  year: string | null;
  avatar_url: string | null;
  theme: string | null;
  biometric_lock: boolean | null;
  proactive_aria: boolean | null;
  haptics: boolean | null;
  notifications: boolean | null;
  onboarded: boolean | null;
  updated_at: string;
}

const now = () => new Date().toISOString();

function taskToRow(t: Task, userId: string): TaskRow {
  return {
    id: t.id,
    user_id: userId,
    title: t.title,
    description: t.description ?? null,
    date: t.date,
    time: t.time ?? null,
    priority: t.priority,
    kind: t.kind,
    status: t.status,
    contact_name: t.contactName ?? null,
    contact_email: t.contactEmail ?? null,
    contact_phone: t.contactPhone ?? null,
    method: t.method ?? null,
    card_template_id: t.cardTemplateId ?? null,
    photo_uri: t.photoUri ?? null,
    subtasks: t.subtasks ?? [],
    draft_sections: t.draftSections ?? [],
    handled_by_aria: t.handledByAria ?? false,
    alarm: t.alarm ?? false,
    created_at: t.createdAt,
    completed_at: t.completedAt ?? null,
    updated_at: now(),
  };
}
function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    date: r.date,
    time: r.time ?? undefined,
    priority: r.priority as Priority,
    kind: r.kind as TaskKind,
    status: r.status as TaskStatus,
    subtasks: r.subtasks ?? [],
    draftSections: r.draft_sections?.length ? r.draft_sections : undefined,
    contactName: r.contact_name ?? undefined,
    contactEmail: r.contact_email ?? undefined,
    contactPhone: r.contact_phone ?? undefined,
    method: (r.method as TaskMethod) ?? undefined,
    cardTemplateId: r.card_template_id ?? undefined,
    photoUri: r.photo_uri ?? undefined,
    handledByAria: r.handled_by_aria ?? undefined,
    alarm: r.alarm ?? undefined,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  };
}

function contactToRow(c: Contact, userId: string): ContactRow {
  return { id: c.id, user_id: userId, name: c.name, email: c.email ?? null, phone: c.phone ?? null };
}
function rowToContact(r: ContactRow): Contact {
  return { id: r.id, name: r.name, email: r.email ?? undefined, phone: r.phone ?? undefined };
}

export function profileToRow(
  p: Profile,
  settings: Settings,
  onboarded: boolean,
  userId: string,
): ProfileRow {
  return {
    id: userId,
    name: p.name,
    email: p.email,
    context: p.context,
    school: null,
    year: null,
    avatar_url: p.avatarUri ?? null,
    theme: settings.theme,
    biometric_lock: settings.biometricLock,
    proactive_aria: settings.proactiveAria,
    haptics: settings.haptics,
    notifications: settings.notifications,
    onboarded,
    updated_at: now(),
  };
}
function rowToProfile(r: ProfileRow): { profile: Profile; settings: Settings; onboarded: boolean } {
  return {
    profile: {
      name: r.name ?? '',
      email: r.email ?? '',
      context: r.context ?? [r.year, r.school].filter(Boolean).join(' · '),
      avatarUri: r.avatar_url ?? undefined,
    },
    settings: {
      theme: (r.theme as Settings['theme']) ?? SETTINGS_DEFAULTS.theme,
      biometricLock: r.biometric_lock ?? SETTINGS_DEFAULTS.biometricLock,
      proactiveAria: r.proactive_aria ?? SETTINGS_DEFAULTS.proactiveAria,
      haptics: r.haptics ?? SETTINGS_DEFAULTS.haptics,
      notifications: r.notifications ?? SETTINGS_DEFAULTS.notifications,
    },
    onboarded: r.onboarded ?? false,
  };
}

// ---------------------------------------------------------------------------
// Offline outbox — failed writes are queued and retried on reconnect/focus.
// ---------------------------------------------------------------------------
type Op = (
  | { table: 'tasks'; kind: 'upsert'; row: TaskRow }
  | { table: 'tasks'; kind: 'delete'; id: string }
  | { table: 'contacts'; kind: 'upsert'; row: ContactRow }
  | { table: 'profiles'; kind: 'upsert'; row: ProfileRow }
) & { attempts?: number };

const OUTBOX_KEY = 'aria-outbox-v1';
/**
 * Give up on an op after this many failed attempts. Some failures are
 * permanent (a column the database hasn't been migrated for, a row the
 * policies reject) and retrying those forever would grow the queue without
 * bound. The device keeps the data either way, and hydrate re-pushes the whole
 * local set whenever the remote comes back empty.
 */
const MAX_ATTEMPTS = 5;
let outbox: Op[] = [];
let outboxLoaded = false;

async function loadOutbox() {
  if (outboxLoaded) return;
  outboxLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    outbox = raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    outbox = [];
  }
}
async function persistOutbox() {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    /* ignore */
  }
}
async function enqueue(op: Op) {
  await loadOutbox();
  outbox.push(op);
  await persistOutbox();
}

async function runOp(op: Op): Promise<boolean> {
  try {
    if (op.table === 'tasks' && op.kind === 'upsert') {
      const { error } = await supabase.from('tasks').upsert(op.row);
      return !error;
    }
    if (op.table === 'tasks' && op.kind === 'delete') {
      const { error } = await supabase.from('tasks').delete().eq('id', op.id);
      return !error;
    }
    if (op.table === 'contacts' && op.kind === 'upsert') {
      const { error } = await supabase.from('contacts').upsert(op.row);
      return !error;
    }
    if (op.table === 'profiles' && op.kind === 'upsert') {
      const { error } = await supabase.from('profiles').upsert(op.row);
      return !error;
    }
  } catch {
    return false;
  }
  return false;
}

/** Try an op now; on failure, queue it for later. */
async function write(op: Op) {
  if (!isSupabaseConfigured || !currentUserId) return;
  const ok = await runOp(op);
  if (!ok) await enqueue(op);
}

/** Retry any queued writes (call on app foreground / reconnect). */
export async function flushOutbox() {
  if (!isSupabaseConfigured || !currentUserId) return;
  await loadOutbox();
  if (!outbox.length) return;
  const remaining: Op[] = [];
  for (const op of outbox) {
    if (await runOp(op)) continue;
    const attempts = (op.attempts ?? 0) + 1;
    if (attempts < MAX_ATTEMPTS) remaining.push({ ...op, attempts });
  }
  outbox = remaining;
  await persistOutbox();
}

// ---------------------------------------------------------------------------
// Public write-through API (called by the store after local updates)
// ---------------------------------------------------------------------------
export function upsertTask(task: Task) {
  if (!currentUserId) return;
  void write({ table: 'tasks', kind: 'upsert', row: taskToRow(task, currentUserId) });
}
export function deleteTaskRow(id: string) {
  void write({ table: 'tasks', kind: 'delete', id });
}
export function upsertContact(contact: Contact) {
  if (!currentUserId) return;
  void write({ table: 'contacts', kind: 'upsert', row: contactToRow(contact, currentUserId) });
}
export function upsertProfile(profile: Profile, settings: Settings, onboarded: boolean) {
  if (!currentUserId) return;
  void write({
    table: 'profiles',
    kind: 'upsert',
    row: profileToRow(profile, settings, onboarded, currentUserId),
  });
}

/** Bulk upsert (used when seeding the current account with demo data). */
export async function upsertTasks(tasks: Task[]) {
  if (!isSupabaseConfigured || !currentUserId) return;
  const rows = tasks.map((t) => taskToRow(t, currentUserId!));
  try {
    await supabase.from('tasks').upsert(rows);
  } catch {
    /* best effort */
  }
}
export async function upsertContacts(contacts: Contact[]) {
  if (!isSupabaseConfigured || !currentUserId) return;
  const rows = contacts.map((c) => contactToRow(c, currentUserId!));
  try {
    await supabase.from('contacts').upsert(rows);
  } catch {
    /* best effort */
  }
}
/** Replace all of the user's remote tasks with the given set (for reset). */
export async function replaceAllTasks(tasks: Task[]) {
  if (!isSupabaseConfigured || !currentUserId) return;
  try {
    await supabase.from('tasks').delete().eq('user_id', currentUserId);
    if (tasks.length) await upsertTasks(tasks);
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// Hydrate — pull the signed-in user's data from Supabase.
// ---------------------------------------------------------------------------
export interface HydrateResult {
  /** Null when the user has no profile row yet — keep whatever is local. */
  profile: Profile | null;
  settings: Settings | null;
  onboarded: boolean;
  tasks: Task[];
  contacts: Contact[];
}

/** Create the initial profile row on signup (name + defaults, not onboarded). */
export async function initProfile(userId: string, name: string, email: string) {
  if (!isSupabaseConfigured) return;
  const row = profileToRow({ name, email, context: '' }, SETTINGS_DEFAULTS, false, userId);
  try {
    await supabase.from('profiles').upsert(row);
  } catch {
    /* trigger already created a bare row; best effort */
  }
}

export async function signOutRemote() {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
}

export async function fetchAll(userId: string): Promise<HydrateResult | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const [profileRes, tasksRes, contactsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    ]);

    // Supabase reports failures as { data: null, error } rather than throwing.
    // A missing table, an unmigrated column or a denied policy must read as
    // "couldn't reach the data", never as "the user has none" — otherwise
    // hydrate would treat it as an empty account and wipe the local cache.
    if (tasksRes.error || contactsRes.error) return null;

    const prof = profileRes.data ? rowToProfile(profileRes.data as ProfileRow) : null;

    return {
      profile: prof?.profile ?? null,
      settings: prof?.settings ?? null,
      onboarded: prof?.onboarded ?? false,
      tasks: ((tasksRes.data as TaskRow[] | null) ?? []).map(rowToTask),
      contacts: ((contactsRes.data as ContactRow[] | null) ?? []).map(rowToContact),
    };
  } catch {
    return null;
  }
}
