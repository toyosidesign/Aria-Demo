import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, isSameWeek, parseISO } from 'date-fns';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  cancelTaskAlarm,
  reconcileAlarms,
  setNotificationsEnabled,
  syncTaskAlarm,
} from '@/lib/alarms';
import {
  cancelAutomationNotice,
  reconcileAutomationNotices,
  scheduleAutomationNotice,
} from '@/lib/automation-notices';
import { isFinished, isPending, type Automation, type AutoChannel } from '@/lib/automations';
import {
  dateToTime,
  formatFull,
  formatTime,
  isPastMoment,
  nextFutureOccurrence,
  toISODate,
  type Repeat,
} from '@/lib/dates';
import { SEED_CONTACTS, type Contact } from '@/lib/contacts';
import { showToast } from '@/lib/toast';
import { uuidv4 } from '@/lib/id';
import {
  deleteTaskRow,
  fetchAll,
  replaceAllContacts,
  replaceAllTasks,
  setSyncUser,
  signOutRemote,
  upsertContact,
  upsertContacts,
  upsertProfile,
  upsertTask,
  upsertTasks,
} from '@/lib/sync';

export type Priority = 'low' | 'medium' | 'high';
export type TaskKind =
  | 'birthday'
  | 'anniversary'
  | 'event'
  | 'reminder'
  | 'assignment'
  | 'project'
  | 'general';
export type TaskStatus = 'todo' | 'done';
/**
 * How Maya wants Aria to handle a task.
 * - Contact/message tasks: sms | email | card | call
 * - Assignments: steps (work through subtasks) | outline | draft (full draft) | remind
 * - General tasks: remind | plan (break into steps) | draft (draft a note)
 */
export type TaskMethod =
  | 'sms'
  | 'email'
  | 'card'
  | 'photo'
  | 'call'
  | 'steps'
  | 'outline'
  | 'draft'
  | 'remind'
  | 'plan';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string; // ISO yyyy-MM-dd — the calendar date
  priority: Priority;
  kind: TaskKind;
  status: TaskStatus;
  subtasks: Subtask[];
  contactName?: string; // drives Aria's proposed action (e.g. "Jane")
  contactEmail?: string; // recipient email(s) for email-method tasks
  contactPhone?: string; // recipient number for text/call-method tasks
  method?: TaskMethod; // how Maya wants Aria to execute it
  cardTemplateId?: string; // which card design, for the 'card' method
  photoUri?: string; // the picture to share, for the 'photo' method
  time?: string; // optional "HH:mm" (24h)
  alarm?: boolean; // chime at the task's date+time via a local notification
  /**
   * How often this comes back. Undefined for a one-off.
   *
   * Modelled as "completing it creates the next one" rather than as a series
   * generated in advance: there is only ever one open occurrence, so the list
   * can't fill with fifty future copies of the same chore, and editing the one
   * in front of you doesn't raise the question of which others it changed.
   */
  repeat?: Repeat;
  draftSections?: DraftSection[]; // content Aria drafted, kept separate from Notes
  createdAt: string;
  completedAt?: string;
  handledByAria?: boolean; // Aria completed it end-to-end
}

/** A titled block of content Aria drafted (e.g. one essay section). */
export interface DraftSection {
  title: string;
  content: string;
}

/** Sensible default handling method for each kind of task. */
export function defaultMethodFor(kind: TaskKind, hasContact: boolean): TaskMethod {
  if (kind === 'birthday') return 'card';
  // An anniversary is usually a photo of the two of them, not a note.
  if (kind === 'anniversary') return 'photo';
  if (kind === 'assignment' || kind === 'project') return 'steps';
  if (kind === 'reminder') return 'remind';
  // general, event
  return hasContact ? 'sms' : 'remind';
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Profile {
  name: string;
  email: string;
  /**
   * One line on who they are — "Sophomore at State University", "Product
   * designer at Acme", "Freelance, two kids". Replaces the old school/year
   * pair, which assumed university and did nothing but sit on the profile.
   * This one feeds Aria's prompts, so it changes how drafts actually read.
   */
  context: string;
  /** Local file URI or remote URL of the profile picture. Falls back to initials. */
  avatarUri?: string;
}

export interface Settings {
  theme: ThemePref;
  /** Require Face ID / Touch ID before revealing the app. Off by default. */
  biometricLock: boolean;
  proactiveAria: boolean;
  haptics: boolean;
  notifications: boolean;
}

/** Effective "today" for the whole app — the real current date, overridable so
 *  the demo can jump to a future date. */
export const DEFAULT_DEMO_DATE = toISODate(new Date());

export const DEFAULT_PROFILE: Profile = {
  name: 'Maya',
  email: 'maya@university.edu',
  context: 'Sophomore at State University',
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  biometricLock: false,
  proactiveAria: true,
  haptics: true,
  notifications: true,
};

let counter = 0;
function uid() {
  counter += 1;
  return `t${Date.now().toString(36)}${counter}`;
}

export function newDraftSubtask(title = ''): Subtask {
  return { id: uid(), title, done: false };
}

/**
 * Sample data, anchored to *today* rather than fixed calendar dates.
 *
 * These used to be hardcoded (2026-07-23 and friends), which meant the demo
 * quietly rotted: as real days passed everything slid into the past, "Today"
 * emptied out, and the app looked broken on first run. Offsets keep the same
 * story — a couple due today, some overdue, some coming up — on any date.
 */
const seedDay = (offset: number) => toISODate(addDays(new Date(), offset));
const seedStamp = (offset: number) => {
  const d = addDays(new Date(), offset);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

function buildSeedTasks(): Task[] {
  return [
    // --- Today: something Aria can actively offer to help with ---
    {
      id: 'seed-email-prof',
      title: 'Email Professor Lee about extension',
      description: 'Ask for two extra days on the stats problem set.',
      date: seedDay(0),
      priority: 'high',
      kind: 'general',
      status: 'todo',
      subtasks: [],
      contactName: 'Professor Lee',
      contactEmail: 'd.lee@university.edu',
      method: 'email',
      createdAt: seedStamp(-3),
    },
    {
      id: 'seed-standup',
      title: 'Take your medication',
      date: seedDay(0),
      time: '20:00',
      priority: 'medium',
      kind: 'reminder',
      status: 'todo',
      subtasks: [],
      method: 'remind',
      createdAt: seedStamp(-8),
    },
    {
      id: 'seed-study-group',
      title: 'Study group at the library',
      date: seedDay(0),
      time: '16:00',
      priority: 'medium',
      kind: 'event',
      status: 'todo',
      subtasks: [],
      method: 'remind',
      createdAt: seedStamp(-5),
    },

    // --- Coming up ---
    {
      id: 'seed-jane-birthday',
      title: 'Wish Jane a happy birthday',
      description: "Jane from study group, she's turning 21.",
      date: seedDay(1),
      priority: 'medium',
      kind: 'birthday',
      status: 'todo',
      subtasks: [],
      contactName: 'Jane',
      method: 'card',
      cardTemplateId: 'birthday-balloons',
      createdAt: seedStamp(-14),
    },
    {
      id: 'seed-history-essay',
      title: 'History essay: the Cold War',
      description: '1500 words on the causes of the Cold War.',
      date: seedDay(1),
      priority: 'high',
      kind: 'assignment',
      status: 'todo',
      subtasks: [
        { id: uid(), title: 'Draft an outline', done: false },
        { id: uid(), title: 'Write introduction', done: false },
        { id: uid(), title: 'Cite sources', done: false },
      ],
      method: 'steps',
      createdAt: seedStamp(-9),
    },
    {
      id: 'seed-america-essay',
      title: 'Essay on the history of America',
      description: '2000 words on the major eras.',
      date: seedDay(2),
      priority: 'high',
      kind: 'assignment',
      status: 'todo',
      subtasks: [],
      method: 'steps',
      createdAt: seedStamp(-4),
    },
    {
      id: 'seed-group-project',
      title: 'Group project: campus recycling',
      description: 'Present findings to the class in two weeks.',
      date: seedDay(3),
      priority: 'medium',
      kind: 'project',
      status: 'todo',
      subtasks: [
        { id: uid(), title: 'Agree the research question', done: false },
        { id: uid(), title: 'Split up the sections', done: false },
      ],
      method: 'outline',
      createdAt: seedStamp(-7),
    },
    {
      id: 'seed-gym',
      title: 'Gym session',
      date: seedDay(3),
      priority: 'low',
      kind: 'general',
      status: 'todo',
      subtasks: [],
      method: 'remind',
      createdAt: seedStamp(-6),
    },
    {
      id: 'seed-anniversary',
      title: "Mum & Dad's anniversary",
      description: 'Send a warm note to celebrate 25 years.',
      date: seedDay(4),
      priority: 'medium',
      kind: 'anniversary',
      status: 'todo',
      subtasks: [],
      contactName: 'Mum',
      method: 'card',
      cardTemplateId: 'anniversary-hearts',
      createdAt: seedStamp(-16),
    },

    // --- Slipped: shows the late state and Aria catching up ---
    {
      id: 'seed-chem-lab',
      title: 'Chemistry lab report',
      description: 'Write up the titration experiment results.',
      date: seedDay(-1),
      priority: 'high',
      kind: 'assignment',
      status: 'todo',
      subtasks: [
        { id: uid(), title: 'Plot the data', done: true },
        { id: uid(), title: 'Analysis section', done: false },
      ],
      method: 'steps',
      createdAt: seedStamp(-11),
    },
    {
      id: 'seed-alex',
      title: 'Congratulate Alex on the new job',
      date: seedDay(-2),
      priority: 'low',
      kind: 'general',
      status: 'todo',
      subtasks: [],
      contactName: 'Alex',
      method: 'sms',
      createdAt: seedStamp(-7),
    },
    {
      id: 'seed-return-books',
      title: 'Return library books',
      description: 'Two overdue since last week.',
      date: seedDay(-3),
      priority: 'medium',
      kind: 'general',
      status: 'todo',
      subtasks: [],
      method: 'remind',
      createdAt: seedStamp(-13),
    },

    // --- Already done: gives the profile stats something to show ---
    {
      id: 'seed-fafsa',
      title: 'Submit financial aid form',
      date: seedDay(-6),
      priority: 'high',
      kind: 'general',
      status: 'done',
      subtasks: [],
      method: 'remind',
      createdAt: seedStamp(-18),
      completedAt: seedStamp(-6),
    },
    {
      id: 'seed-reading',
      title: 'Finish sociology reading',
      date: seedDay(-4),
      priority: 'low',
      kind: 'assignment',
      status: 'done',
      subtasks: [],
      method: 'outline',
      createdAt: seedStamp(-10),
      completedAt: seedStamp(-4),
    },
  ];
}

/** Tasks in a single week before Aria offers to rebalance. */
export const OVERLOAD_THRESHOLD = 5;

/**
 * Tasks on a single day before it's flagged as too much. Separate from the
 * weekly figure above: a light week can still hide one punishing day, and
 * that's exactly the day worth pointing at.
 */
export const HEAVY_DAY_THRESHOLD = 4;

interface AriaState {
  tasks: Task[];
  demoDate: string;
  profile: Profile;
  settings: Settings;
  contacts: Contact[]; // Maya's own saved contacts
  automations: Automation[]; // work Aria runs at a scheduled moment
  /**
   * Who signed in here last. Survives sign-out on purpose — it's what lets the
   * login screen greet a returning user by name instead of treating every
   * visit as a first one. Name and email only; never a credential.
   */
  lastUser: { name: string; email: string } | null;
  pro: boolean; // Aria Pro — unlocks scheduled automations + every integration
  proWaitlisted: boolean; // asked to be told when Pro opens up
  signedIn: boolean;
  onboarded: boolean; // false right after a new signup, until the welcome is done
  hydrated: boolean;
  setHydrated: () => void;
  setDemoDate: (date: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setPro: (pro: boolean) => void;
  rememberUser: (user: { name?: string; email?: string }) => void;
  forgetUser: () => void;
  joinProWaitlist: () => void;
  signIn: (input: { name?: string; email?: string; isNew?: boolean }) => void;
  signOut: () => void;
  hydrate: (userId: string) => Promise<void>;
  clearLocal: () => void;
  completeOnboarding: () => void;
  addContact: (contact: Contact) => void;
  /** Fill in details (email/phone) on a contact Maya already saved. */
  updateContact: (id: string, patch: Partial<Omit<Contact, 'id'>>) => void;
  addTask: (input: {
    title: string;
    date: string;
    priority: Priority;
    kind: TaskKind;
    description?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    method?: TaskMethod;
    cardTemplateId?: string;
    photoUri?: string;
    time?: string;
    alarm?: boolean;
    repeat?: Repeat;
    subtasks?: Subtask[];
  }) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addDraftSection: (taskId: string, section: DraftSection) => void;
  addSubtasks: (taskId: string, titles: string[]) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  completeTask: (id: string, opts?: { byAria?: boolean }) => void;
  reopenTask: (id: string) => void;
  /** `silent` when the move is provisional and the UI is still asking where to
   *  put it — confirming before the user has decided reads as a lie. */
  rescheduleTask: (id: string, date: string, opts?: { silent?: boolean }) => void;
  /** Push a reminder out to a later moment, keeping it on the list. */
  snoozeTask: (id: string, until: Date) => void;
  deleteTask: (id: string) => void;
  scheduleAutomation: (input: {
    taskId: string;
    taskTitle: string;
    channel: AutoChannel;
    runAt: string;
    body: string;
    subject?: string;
    toName?: string;
    toEmail?: string;
    toPhone?: string;
  }) => string;
  cancelAutomation: (id: string) => void;
  /** Record the outcome once Aria has run it (or failed to). */
  settleAutomation: (
    id: string,
    outcome: { status: Automation['status']; error?: string },
  ) => void;
  resetDemo: () => void;
  /**
   * Empty the planner and start on real data.
   *
   * The counterpart to `resetDemo`, which only ever *restores* the samples —
   * there was no way out of demo data short of deleting each task by hand, so
   * the home screen's offer to "clear them and start on your own" was a promise
   * the app couldn't keep.
   *
   * Deliberately leaves the account alone: profile, settings and sign-in state
   * survive. This clears what's *in* the planner, it doesn't reset the app.
   */
  clearAllData: () => void;
  /**
   * Whether the "try the sample data" offer on the home screen has been
   * answered. Set either way — taking the tour or declining it both count, so
   * the card asks once and never again.
   */
  demoOfferDismissed: boolean;
  dismissDemoOffer: () => void;
}

/** Drop blank/missing fields so a bare remote row can't blank out local values. */
function definedFields(profile: Profile): Partial<Profile> {
  return Object.fromEntries(
    Object.entries(profile).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<Profile>;
}

/** Push the current version of a task (after a local mutation) to Supabase + reconcile its alarm. */
function syncTask(get: () => AriaState, id: string) {
  const t = get().tasks.find((x) => x.id === id);
  if (t) {
    upsertTask(t);
    void syncTaskAlarm(t);
  }
}

export const useAriaStore = create<AriaState>()(
  persist(
    (set, get) => ({
      tasks: buildSeedTasks(),
      demoDate: DEFAULT_DEMO_DATE,
      profile: DEFAULT_PROFILE,
      settings: DEFAULT_SETTINGS,
      contacts: SEED_CONTACTS,
      automations: [],
      lastUser: null,
      pro: false,
      proWaitlisted: false,
      signedIn: false,
      onboarded: true,
      demoOfferDismissed: false,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      setDemoDate: (date) => set({ demoDate: date }),
      updateProfile: (patch) => {
        set((s) => ({ profile: { ...s.profile, ...patch } }));
        upsertProfile(get().profile, get().settings, get().onboarded);
      },
      setPro: (pro) => set({ pro }),
      rememberUser: ({ name, email }) =>
        set((s) => ({
          lastUser: {
            name: name?.trim() || s.lastUser?.name || '',
            email: email?.trim() || s.lastUser?.email || '',
          },
        })),
      forgetUser: () => set({ lastUser: null }),
      joinProWaitlist: () => set({ proWaitlisted: true }),
      setSetting: (key, value) => {
        set((s) => ({ settings: { ...s.settings, [key]: value } }));
        // Turning notifications off must cancel what's already booked, not just
        // stop new ones — otherwise alarms keep arriving after you said no.
        if (key === 'notifications') {
          setNotificationsEnabled(value as boolean);
          void reconcileAlarms(get().tasks);
          void reconcileAutomationNotices(get().automations);
        }
        upsertProfile(get().profile, get().settings, get().onboarded);
      },
      signIn: (input) =>
        set((s) => ({
          signedIn: true,
          lastUser: {
            name: input.name?.trim() || s.lastUser?.name || s.profile.name,
            email: input.email?.trim() || s.lastUser?.email || s.profile.email,
          },
          // New account: start fresh — no tasks or contacts, and show the welcome.
          onboarded: input.isNew ? false : s.onboarded,
          tasks: input.isNew ? [] : s.tasks,
          contacts: input.isNew ? [] : s.contacts,
          demoDate: input.isNew ? DEFAULT_DEMO_DATE : s.demoDate,
          // A fresh account gets the offer again — the previous person's answer
          // to it isn't this person's.
          demoOfferDismissed: input.isNew ? false : s.demoOfferDismissed,
          profile: {
            ...s.profile,
            ...(input.name ? { name: input.name } : {}),
            ...(input.email ? { email: input.email } : {}),
          },
        })),
      signOut: () => {
        set({ signedIn: false });
        void signOutRemote();
      },
      hydrate: async (userId) => {
        const data = await fetchAll(userId);
        if (!data) {
          // Offline, or the fetch failed: keep the cached data untouched.
          set({ signedIn: true });
          void reconcileAlarms(get().tasks);
          return;
        }
        // Hydrating must never destroy local work. An empty remote set means
        // "nothing has synced up yet", not "this account has nothing" — keep
        // what's on the device and push it up instead.
        const localTasks = get().tasks;
        const localContacts = get().contacts;
        const remembered = get().lastUser;
        const remote = data.profile ? definedFields(data.profile) : {};
        // A profile row created by the signup trigger carries only an email, so
        // the name arrives blank. Fall back to what was typed at signup rather
        // than to DEFAULT_PROFILE, which would greet everyone as the demo persona.
        const name = remote.name || remembered?.name;
        set((s) => ({
          signedIn: true,
          profile: { ...s.profile, ...(name ? { name } : {}), ...remote },
          settings: data.settings ?? s.settings,
          onboarded: data.onboarded || s.onboarded,
          tasks: data.tasks.length ? data.tasks : s.tasks,
          contacts: data.contacts.length ? data.contacts : s.contacts,
        }));
        setNotificationsEnabled(get().settings.notifications);
        const profile = get().profile;
        if (profile.name || profile.email) {
          set({ lastUser: { name: profile.name, email: profile.email } });
        }
        // Repair the remote row so the name is there next time, on any device.
        if (!remote.name && profile.name) {
          upsertProfile(profile, get().settings, get().onboarded);
        }
        if (!data.tasks.length && localTasks.length) void upsertTasks(localTasks);
        if (!data.contacts.length && localContacts.length) void upsertContacts(localContacts);
        void reconcileAlarms(get().tasks);
      },
      clearLocal: () => {
        setSyncUser(null);
        set({ signedIn: false, tasks: [], contacts: [], automations: [], profile: DEFAULT_PROFILE });
      },
      completeOnboarding: () => {
        set({ onboarded: true });
        upsertProfile(get().profile, get().settings, true);
      },
      addContact: (contact) => {
        const key = (c: Contact) => `${c.name.trim().toLowerCase()}|${(c.email ?? '').toLowerCase()}`;
        if (get().contacts.some((c) => key(c) === key(contact))) return;
        set((s) => ({ contacts: [...s.contacts, contact] }));
        upsertContact(contact);
      },
      updateContact: (id, patch) => {
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
        const next = get().contacts.find((c) => c.id === id);
        if (next) upsertContact(next);
      },
      addTask: (input) => {
        const id = uuidv4();
        const task: Task = {
          id,
          title: input.title.trim(),
          description: input.description?.trim() || undefined,
          date: input.date,
          priority: input.priority,
          kind: input.kind,
          status: 'todo',
          subtasks: input.subtasks ?? [],
          contactName: input.contactName?.trim() || undefined,
          contactEmail: input.contactEmail?.trim() || undefined,
          contactPhone: input.contactPhone?.trim() || undefined,
          method: input.method,
          cardTemplateId: input.cardTemplateId,
          photoUri: input.photoUri,
          time: input.time || undefined,
          alarm: input.alarm || undefined,
          repeat: input.repeat,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        upsertTask(task);
        void syncTaskAlarm(task);
        showToast('Task added', 'plus');
        return id;
      },
      updateTask: (id, patch) => {
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
        syncTask(get, id);
      },
      addDraftSection: (taskId, section) => {
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const existing = t.draftSections ?? [];
            const idx = existing.findIndex((d) => d.title === section.title);
            const next =
              idx >= 0
                ? existing.map((d, i) => (i === idx ? section : d))
                : [...existing, section];
            return { ...t, draftSections: next };
          }),
        }));
        syncTask(get, taskId);
      },
      addSubtasks: (taskId, titles) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: [...t.subtasks, ...titles.map((title) => newDraftSubtask(title))] }
              : t,
          ),
        }));
        syncTask(get, taskId);
      },
      toggleSubtask: (taskId, subtaskId) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: t.subtasks.map((st) =>
                    st.id === subtaskId ? { ...st, done: !st.done } : st,
                  ),
                }
              : t,
          ),
        }));
        syncTask(get, taskId);
      },
      completeTask: (id, opts) => {
        const done = get().tasks.find((t) => t.id === id);

        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'done',
                  completedAt: new Date().toISOString(),
                  handledByAria: opts?.byAria ?? t.handledByAria,
                }
              : t,
          ),
        }));
        syncTask(get, id);

        // A recurring task earns its next occurrence by being finished. The
        // completed one stays in the list as the record that it happened.
        if (done?.repeat && done.status !== 'done') {
          const nextDate = nextFutureOccurrence(done.date, done.repeat);
          const next: Task = {
            ...done,
            id: uuidv4(),
            date: nextDate,
            status: 'todo',
            completedAt: undefined,
            handledByAria: undefined,
            createdAt: new Date().toISOString(),
            // Anything Aria wrote belonged to the occasion just gone. Carrying
            // last week's draft forward would quietly re-send it.
            draftSections: undefined,
            // Checklists come back unticked, or the next one starts finished.
            subtasks: done.subtasks.map((s) => ({ ...s, done: false })),
          };
          set((s) => ({ tasks: [next, ...s.tasks] }));
          upsertTask(next);
          if (next.alarm && next.time) void syncTaskAlarm(next);
          showToast(`Done. Next one ${formatFull(nextDate)}.`, 'check');
          return;
        }

        showToast('Task completed', 'check');
      },
      reopenTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, status: 'todo', completedAt: undefined, handledByAria: false } : t,
          ),
        }));
        syncTask(get, id);
        showToast('Task reopened', 'undo');
      },
      rescheduleTask: (id, date, opts) => {
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, date } : t)) }));
        syncTask(get, id);
        if (!opts?.silent) showToast('Task rescheduled', 'clock');
      },
      snoozeTask: (id, until) => {
        const date = toISODate(until);
        const time = dateToTime(until);
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, date, time } : t)),
        }));
        syncTask(get, id); // re-arms the alarm for the new moment
        const today = toISODate(new Date());
        showToast(
          date === today ? `Snoozed until ${formatTime(time)}` : `Snoozed to ${formatFull(date)}`,
          'clock',
        );
      },
      deleteTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        deleteTaskRow(id);
        void cancelTaskAlarm(id);
        showToast('Task deleted', 'trash');
      },
      scheduleAutomation: (input) => {
        const id = uuidv4();
        const automation: Automation = {
          id,
          ...input,
          status: 'scheduled',
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ automations: [automation, ...s.automations] }));
        // A local notification is what lets Aria act at the right moment even
        // when the app has been closed since.
        void scheduleAutomationNotice(automation);
        return id;
      },
      cancelAutomation: (id) => {
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id ? { ...a, status: 'cancelled' as const } : a,
          ),
        }));
        void cancelAutomationNotice(id);
        showToast('Scheduled task cancelled', 'undo');
      },
      settleAutomation: (id, outcome) => {
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id
              ? { ...a, status: outcome.status, error: outcome.error, ranAt: new Date().toISOString() }
              : a,
          ),
        }));
        void cancelAutomationNotice(id);
        // Sending was the whole task — check it off the same way Aria does
        // when it handles something end to end.
        if (outcome.status === 'sent' || outcome.status === 'done') {
          const a = get().automations.find((x) => x.id === id);
          if (a) get().completeTask(a.taskId, { byAria: true });
        }
      },
      resetDemo: () => {
        const tasks = buildSeedTasks().map((t) => ({ ...t, id: uuidv4() }));
        const contacts = SEED_CONTACTS.map((c) => ({ ...c, id: uuidv4() }));
        // Answered by taking it, so the home-screen offer doesn't come back and
        // ask whether you'd like the data you're currently looking at.
        set({ tasks, demoDate: DEFAULT_DEMO_DATE, contacts, automations: [], demoOfferDismissed: true });
        void replaceAllTasks(tasks);
        void upsertContacts(contacts);
      },
      clearAllData: () => {
        set({
          tasks: [],
          contacts: [],
          automations: [],
          // Back to the real calendar too: a simulated date is part of the demo,
          // and leaving it set would make an empty planner look broken.
          demoDate: DEFAULT_DEMO_DATE,
          // Nothing left to offer a tour of, and they've just declined it by
          // action — don't ask again on the now-empty home screen.
          demoOfferDismissed: true,
        });
        // Alarms outlive the tasks that scheduled them, so a cleared planner
        // would otherwise still chime for something that no longer exists.
        void reconcileAlarms([]);
        void reconcileAutomationNotices([]);
        void replaceAllTasks([]);
        void replaceAllContacts([]);
      },
      dismissDemoOffer: () => set({ demoOfferDismissed: true }),
    }),
    {
      name: 'aria-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        tasks: s.tasks,
        demoDate: s.demoDate,
        profile: s.profile,
        settings: s.settings,
        contacts: s.contacts,
        automations: s.automations,
        lastUser: s.lastUser,
        pro: s.pro,
        proWaitlisted: s.proWaitlisted,
        signedIn: s.signedIn,
        onboarded: s.onboarded,
        demoOfferDismissed: s.demoOfferDismissed,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // A previously persisted "today" that now sits in the past is a stale
        // default (simulated dates are always in the future) — snap it to today
        // so the calendar and everything keyed off "today" stay correct.
        const today = toISODate(new Date());
        if (state.demoDate < today) state.setDemoDate(today);
        setNotificationsEnabled(state.settings.notifications);

        // Fold a pre-existing school/year pair into the single context line.
        const legacy = state.profile as Partial<{ school: string; year: string }>;
        if (!state.profile.context && (legacy.school || legacy.year)) {
          state.updateProfile({
            context: [legacy.year, legacy.school].filter(Boolean).join(' · '),
          });
        }

        // Backfill for installs that signed in before `lastUser` existed, so a
        // returning user is greeted by name on their next visit rather than
        // having to sign in once more first. Gated on `signedIn` because the
        // default profile carries a real-looking name — without that check a
        // brand-new install would be welcomed back as someone it's never met.
        if (!state.lastUser && state.signedIn && state.profile.name) {
          state.rememberUser({ name: state.profile.name, email: state.profile.email });
        }

        state.setHydrated();
      },
    },
  ),
);

// ---- Selectors / derived helpers (pure; take the current task list + demoDate) ----

export function sortByDate(a: Task, b: Task) {
  // Soonest first: order by day, then by appointed time within the day.
  // Untimed tasks sort after timed ones on the same day.
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time ?? '99:99';
  const bt = b.time ?? '99:99';
  return at < bt ? -1 : at > bt ? 1 : 0;
}

export function selectUpcoming(tasks: Task[], demoDate: string) {
  return tasks
    .filter((t) => t.status === 'todo' && t.date >= demoDate && !isLate(t, demoDate))
    .sort(sortByDate);
}

export function selectLate(tasks: Task[], demoDate: string) {
  return tasks.filter((t) => isLate(t, demoDate)).sort(sortByDate);
}

/** Scheduled work whose moment has arrived and that Aria hasn't run yet. */
export function selectDueAutomations(automations: Automation[], now: Date = new Date()) {
  return automations
    .filter((a) => isPending(a) && parseISO(a.runAt).getTime() <= now.getTime())
    .sort((a, b) => a.runAt.localeCompare(b.runAt));
}

/** Still waiting — what the "Aria will handle" list shows. */
export function selectUpcomingAutomations(automations: Automation[], now: Date = new Date()) {
  return automations
    .filter((a) => isPending(a) && parseISO(a.runAt).getTime() > now.getTime())
    .sort((a, b) => a.runAt.localeCompare(b.runAt));
}

/** Aria's report: everything it has finished, newest first. */
export function selectAutomationReport(automations: Automation[]) {
  return automations
    .filter(isFinished)
    .sort((a, b) => (b.ranAt ?? b.createdAt).localeCompare(a.ranAt ?? a.createdAt));
}

export function selectDone(tasks: Task[]) {
  return tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

export function selectToday(tasks: Task[], demoDate: string) {
  return tasks.filter((t) => t.status === 'todo' && t.date === demoDate).sort(sortByDate);
}

/**
 * The next task worth carrying on to after finishing one.
 *
 * Deliberately limited to what's due today or already overdue: sending someone
 * into a task scheduled for next week isn't continuing their run, it's inviting
 * them to do work that isn't theirs yet. Sorted soonest-first, so anything late
 * comes ahead of today's.
 */
export function selectNextDue(
  tasks: Task[],
  demoDate: string,
  excludeId?: string,
): Task | undefined {
  return tasks
    .filter((t) => t.status === 'todo' && t.id !== excludeId && t.date <= demoDate)
    .sort(sortByDate)[0];
}

export interface WeekLoad {
  count: number;
  overloaded: boolean;
  tasks: Task[];
}

export function selectWeekLoad(tasks: Task[], demoDate: string): WeekLoad {
  const ref = parseISO(demoDate);
  const inWeek = tasks.filter(
    (t) => t.status === 'todo' && isSameWeek(parseISO(t.date), ref, { weekStartsOn: 0 }),
  );
  return { count: inWeek.length, overloaded: inWeek.length >= OVERLOAD_THRESHOLD, tasks: inWeek };
}

/**
 * Overdue — an earlier day, or today with its time already gone.
 *
 * This used to compare dates alone, so something due at 3pm stayed "upcoming"
 * until midnight. A time on a task is a deadline, not decoration: once it's
 * passed, the task is late.
 */
/**
 * Nothing to do but acknowledge it. Keyed off the handling rather than the
 * category, because an event set to "Just remind me" is a reminder in every
 * way that matters to the person looking at it.
 */
export function isReminderOnly(task: Task): boolean {
  return task.kind === 'reminder' || task.method === 'remind';
}

export function isLate(task: Task, demoDate: string) {
  if (task.status !== 'todo') return false;
  if (task.date < demoDate) return true;
  if (task.date > demoDate) return false;
  return !!task.time && isPastMoment(task.date, task.time);
}

/**
 * Whether a reminder's moment has actually arrived.
 *
 * Distinct from `isLate`: a reminder set for 3pm today hasn't rung at 2pm, but
 * it isn't late either. Answering "Got it" or "Snooze" before the thing has
 * happened is meaningless, so those only appear once this is true.
 *
 * A reminder with no time is treated as due for the whole of its day rather
 * than only at 23:59 — otherwise an all-day reminder would sit unanswerable
 * until the day was practically over.
 */
export function hasReminderFired(task: Task, demoDate: string): boolean {
  if (task.date < demoDate) return true;
  if (task.date > demoDate) return false;
  return !task.time || isPastMoment(task.date, task.time);
}
