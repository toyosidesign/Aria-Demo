import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Automation, AutoChannel, AutoStatus } from '@/lib/automations';
import { type Contact } from '@/lib/contacts';
import type { Repeat } from '@/lib/dates';
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
  autoSend: false,
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
  repeat: string | null;
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
/**
 * The statuses the *table* allows, which is one more than the app has.
 *
 * 'sending' is the claim marker that stops the cron and the device from both
 * sending the same email. It is deliberately not in `AutoStatus`: it is never
 * shown, never chosen, and nothing in the UI should have to hold an opinion
 * about a state that exists for a few hundred milliseconds inside a
 * transaction.
 */
type DbAutoStatus = AutoStatus | 'sending';

interface AutomationRow {
  id: string;
  user_id: string;
  task_id: string;
  task_title: string;
  channel: string;
  run_at: string;
  to_name: string | null;
  to_email: string | null;
  to_phone: string | null;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
  ran_at: string | null;
  error: string | null;
  updated_at: string;
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
  studying: string | null;
  level: string | null;
  interests: string[] | null;
  explain_style: string | null;
  theme: string | null;
  biometric_lock: boolean | null;
  proactive_aria: boolean | null;
  haptics: boolean | null;
  notifications: boolean | null;
  auto_send: boolean | null;
  pro: boolean | null;
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
    repeat: t.repeat ?? null,
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
    // Cast rather than validate: the column is only ever written from the union
    // above, and a bad value here degrades to "doesn't repeat" at the next
    // completion rather than breaking anything.
    repeat: (r.repeat as Repeat | null) ?? undefined,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  };
}

function automationToRow(a: Automation, userId: string): AutomationRow {
  return {
    id: a.id,
    user_id: userId,
    task_id: a.taskId,
    task_title: a.taskTitle,
    channel: a.channel,
    run_at: a.runAt,
    to_name: a.toName ?? null,
    to_email: a.toEmail ?? null,
    to_phone: a.toPhone ?? null,
    subject: a.subject ?? null,
    body: a.body,
    status: a.status,
    created_at: a.createdAt,
    ran_at: a.ranAt ?? null,
    error: a.error ?? null,
    updated_at: now(),
  };
}
function rowToAutomation(r: AutomationRow): Automation {
  return {
    id: r.id,
    taskId: r.task_id,
    taskTitle: r.task_title,
    channel: r.channel as AutoChannel,
    runAt: r.run_at,
    toName: r.to_name ?? undefined,
    toEmail: r.to_email ?? undefined,
    toPhone: r.to_phone ?? undefined,
    subject: r.subject ?? undefined,
    body: r.body,
    // 'sending' is a database-only state — the claim marker that stops the cron
    // and the device from both sending the same email. It has no app-side
    // meaning, and the honest reading of "somebody is mid-send and it is not
    // confirmed yet" is the state it came from. The device cannot act on it
    // either way: its own claim will find the row already taken and skip.
    status: (r.status === 'sending' ? 'scheduled' : r.status) as AutoStatus,
    createdAt: r.created_at,
    ranAt: r.ran_at ?? undefined,
    error: r.error ?? undefined,
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
  pro = false,
): ProfileRow {
  return {
    id: userId,
    name: p.name,
    email: p.email,
    context: p.context,
    school: null,
    year: null,
    avatar_url: p.avatarUri ?? null,
    studying: p.studying ?? null,
    level: p.level ?? null,
    interests: p.interests ?? [],
    explain_style: p.explainStyle ?? null,
    // Written so the column is not left stale, never read back — see rowToProfile.
    theme: settings.theme,
    biometric_lock: settings.biometricLock,
    proactive_aria: settings.proactiveAria,
    haptics: settings.haptics,
    notifications: settings.notifications,
    // Server-visible on purpose: the cron sends with no device involved, so
    // these two are the only way it can know whether it is allowed to.
    auto_send: settings.autoSend,
    pro,
    onboarded,
    updated_at: now(),
  };
}
/**
 * A remote row, with the columns it actually has an opinion about.
 *
 * Settings come back **partial** on purpose. Filling the blanks with defaults
 * here was silently destructive: the signup trigger creates a profiles row
 * holding only id and email, so `theme` is null, `?? 'system'` turned that null
 * into a real preference, and hydrate then wrote it over whatever the user had
 * chosen on the device. Pick Charcoal, reopen the app, and it came back as
 * whatever the phone was set to.
 *
 * A column that is null means "this row has nothing to say", not "the user
 * wants the default". Only set columns are returned, and hydrate merges them
 * over the local values.
 *
 * `theme` is deliberately **not** among them. Appearance is a property of the
 * device, not of the account — a phone and a tablet can reasonably want
 * different ones, and the person who set Charcoal on this handset did not ask
 * for it to follow them elsewhere.
 *
 * It also could not work as a synced value here. The column is declared
 * `default 'system'`, so the row the signup trigger creates already says
 * 'system' — never null, so no "is it set?" test can tell a real preference
 * from a column default. Every launch it overwrote the local choice and the
 * app came back on whatever the phone was set to.
 */
function rowToProfile(r: ProfileRow): {
  profile: Profile;
  settings: Partial<Settings>;
  onboarded: boolean;
} {
  const settings: Partial<Settings> = {};
  if (r.biometric_lock != null) settings.biometricLock = r.biometric_lock;
  if (r.proactive_aria != null) settings.proactiveAria = r.proactive_aria;
  if (r.haptics != null) settings.haptics = r.haptics;
  if (r.notifications != null) settings.notifications = r.notifications;
  if (r.auto_send != null) settings.autoSend = r.auto_send;

  return {
    profile: {
      name: r.name ?? '',
      email: r.email ?? '',
      context: r.context ?? [r.year, r.school].filter(Boolean).join(' · '),
      avatarUri: r.avatar_url ?? undefined,
      studying: r.studying ?? undefined,
      level: r.level ?? undefined,
      // An absent column and an empty list mean the same thing here — nothing
      // was chosen — so both collapse to undefined rather than [] vs null.
      interests: r.interests?.length ? r.interests : undefined,
      explainStyle: (r.explain_style as Profile['explainStyle']) ?? undefined,
    },
    settings,
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
  | { table: 'automations'; kind: 'upsert'; row: AutomationRow }
  /**
   * A status move, expressed as a *conditional* update rather than an upsert.
   *
   * An upsert here would be a resend waiting to happen. The device's copy of an
   * automation can easily be behind the server's — the cron sends at 09:00 and
   * writes 'sent', the phone was asleep and still says 'scheduled' — and a blind
   * upsert from that stale copy would put the row back to 'scheduled' for the
   * cron to find and send a second time. `from` names the states the move is
   * legal from, so a write that arrives after the fact matches nothing and is
   * discarded instead of rewinding the row.
   */
  | {
      table: 'automations';
      kind: 'status';
      id: string;
      status: AutoStatus;
      ranAt?: string;
      error?: string;
      from: DbAutoStatus[];
    }
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
    if (op.table === 'automations' && op.kind === 'upsert') {
      const { error } = await supabase.from('automations').upsert(op.row);
      return !error;
    }
    if (op.table === 'automations' && op.kind === 'status') {
      const { error } = await supabase
        .from('automations')
        .update({
          status: op.status,
          ran_at: op.ranAt ?? null,
          error: op.error ?? null,
          updated_at: now(),
        })
        .eq('id', op.id)
        // Matching nothing is a success, not a failure: it means the row has
        // already moved past this state and the write is stale. Retrying it
        // would never succeed, and queueing it forever is how the outbox grows
        // without bound.
        .in('status', op.from);
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
export function upsertProfile(
  profile: Profile,
  settings: Settings,
  onboarded: boolean,
  pro = false,
) {
  if (!currentUserId) return;
  void write({
    table: 'profiles',
    kind: 'upsert',
    row: profileToRow(profile, settings, onboarded, currentUserId, pro),
  });
}

/**
 * Record a newly scheduled automation server-side.
 *
 * This is what makes the cron possible at all: until the row exists in Postgres
 * the only copy of "email Mum on Friday" is on a phone that will be in a bag on
 * Friday morning.
 */
export function upsertAutomation(automation: Automation) {
  if (!currentUserId) return;
  void write({
    table: 'automations',
    kind: 'upsert',
    row: automationToRow(automation, currentUserId),
  });
}

/** The user called it off. Only legal while it hasn't gone yet. */
export function cancelAutomationRow(id: string) {
  void write({
    table: 'automations',
    kind: 'status',
    id,
    status: 'cancelled',
    from: ['scheduled', 'ready'],
  });
}

/** It ran, one way or another — record how it went. */
export function settleAutomationRow(id: string, status: AutoStatus, error?: string) {
  void write({
    table: 'automations',
    kind: 'status',
    id,
    status,
    ranAt: now(),
    error,
    // 'sending' is included because the device claims a row before running it,
    // so the state it is settling *from* is the claim it just made.
    from: ['scheduled', 'sending', 'ready'],
  });
}

export type ClaimResult =
  | { outcome: 'claimed' }
  /** Somebody else has it. `status` is what the server says became of it. */
  | { outcome: 'taken'; status: DbAutoStatus }
  /** There is no server to arbitrate with, so nothing else can be sending. */
  | { outcome: 'unavailable' }
  /** There is one and it could not be reached, so who owns this is unknown. */
  | { outcome: 'unreachable' };

/**
 * Take ownership of an automation before running it, so the cron cannot also.
 *
 * The conditional update is the lock — see the long note in
 * `supabase/migrations/003_automations.sql`. A row comes back only to whoever
 * actually moved it out of 'scheduled'.
 *
 * The two negative answers are deliberately different, and collapsing them was
 * a bug in the first version of this:
 *
 *   · `unavailable` — there is no server. Supabase isn't configured, or nobody
 *     is signed in, or the automation was scheduled offline and has no row yet.
 *     No cron can be running against data that isn't there, so the device is
 *     the only candidate and proceeds. The demo build lives here permanently.
 *
 *   · `unreachable` — there *is* a server and we couldn't talk to it, so who
 *     owns this row is simply unknown. The caller must not send. Note that the
 *     mail route is a different host from Supabase: "Supabase is unreachable"
 *     does not imply "the send would fail anyway", and a cron tick landing in
 *     the same window would make it two emails. Late beats twice.
 */
export async function claimAutomation(id: string): Promise<ClaimResult> {
  if (!isSupabaseConfigured || !currentUserId) return { outcome: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('automations')
      .update({ status: 'sending', ran_at: now(), updated_at: now() })
      .eq('id', id)
      .eq('status', 'scheduled')
      .select('id');
    if (error) return { outcome: 'unreachable' };
    if (data && data.length) return { outcome: 'claimed' };

    /*
     * Nothing matched, which is two very different situations.
     *
     * Either the row is there and somebody already has it — the cron sent this
     * a moment ago — or there is no row at all, because it was scheduled while
     * offline and the outbox hasn't drained yet. Reading the second as `taken`
     * would mean an automation created on a plane never runs anywhere: the
     * device refuses because it thinks the server has it, and the server has
     * nothing to run.
     *
     * A row that does not exist cannot be claimed by a cron either, so the
     * device is the only candidate and proceeds.
     */
    const { data: existing, error: lookupError } = await supabase
      .from('automations')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) return { outcome: 'unreachable' };
    if (!existing) return { outcome: 'unavailable' };
    // Reported raw, 'sending' included: the caller needs to tell "the cron sent
    // this an hour ago" from "the cron is sending it right now", and those want
    // different things said to the student.
    return { outcome: 'taken', status: (existing as { status: string }).status as DbAutoStatus };
  } catch {
    return { outcome: 'unreachable' };
  }
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

/**
 * And for automations, on a reset or a clear-out.
 *
 * Wiping the local list without this would leave the cron holding rows nobody
 * can see — the student clears their data and still gets an email on Friday
 * from a task that no longer exists anywhere in the app.
 */
export async function replaceAllAutomations(automations: Automation[]) {
  if (!isSupabaseConfigured || !currentUserId) return;
  try {
    await supabase.from('automations').delete().eq('user_id', currentUserId);
    if (automations.length) {
      const rows = automations.map((a) => automationToRow(a, currentUserId!));
      await supabase.from('automations').upsert(rows);
    }
  } catch {
    /* best effort */
  }
}

/**
 * The same for contacts.
 *
 * Needed because clearing the demo out has to clear the sample *people* too —
 * deleting the tasks and leaving Jane and Sam in the contact list is a
 * half-finished fresh start.
 */
export async function replaceAllContacts(contacts: Contact[]) {
  if (!isSupabaseConfigured || !currentUserId) return;
  try {
    await supabase.from('contacts').delete().eq('user_id', currentUserId);
    if (contacts.length) await upsertContacts(contacts);
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
  /** Only the settings the remote row actually sets. See `rowToProfile`. */
  settings: Partial<Settings> | null;
  onboarded: boolean;
  tasks: Task[];
  contacts: Contact[];
  automations: Automation[];
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
    const [profileRes, tasksRes, contactsRes, automationsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase
        .from('automations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    // Supabase reports failures as { data: null, error } rather than throwing.
    // A missing table, an unmigrated column or a denied policy must read as
    // "couldn't reach the data", never as "the user has none" — otherwise
    // hydrate would treat it as an empty account and wipe the local cache.
    if (tasksRes.error || contactsRes.error) return null;

    /*
     * Automations are the exception, and only in one direction.
     *
     * A device running against a project where 003 hasn't been applied gets an
     * error here for a table that genuinely isn't there. Failing the whole
     * hydrate over it would take tasks and contacts down with it and brick the
     * app on an un-migrated project, so the error degrades to "no automations
     * synced" and the device keeps its local list.
     *
     * It degrades to the *local* list, never to an empty one — see how hydrate
     * merges this. An empty result must not be read as "this account has none".
     */
    const automations = automationsRes.error
      ? []
      : ((automationsRes.data as AutomationRow[] | null) ?? []).map(rowToAutomation);

    const prof = profileRes.data ? rowToProfile(profileRes.data as ProfileRow) : null;

    return {
      profile: prof?.profile ?? null,
      settings: prof?.settings ?? null,
      onboarded: prof?.onboarded ?? false,
      tasks: ((tasksRes.data as TaskRow[] | null) ?? []).map(rowToTask),
      contacts: ((contactsRes.data as ContactRow[] | null) ?? []).map(rowToContact),
      automations,
    };
  } catch {
    return null;
  }
}
