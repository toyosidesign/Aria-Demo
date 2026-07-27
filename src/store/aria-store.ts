import AsyncStorage from '@react-native-async-storage/async-storage';
import { isBefore, isSameWeek, parseISO } from 'date-fns';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_CONTACTS, type Contact } from '@/lib/contacts';

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
  method?: TaskMethod; // how Maya wants Aria to execute it
  time?: string; // optional "HH:mm" (24h)
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
  if (kind === 'anniversary') return 'sms';
  if (kind === 'assignment' || kind === 'project') return 'steps';
  if (kind === 'reminder') return 'remind';
  // general, event
  return hasContact ? 'sms' : 'remind';
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Profile {
  name: string;
  email: string;
  school: string;
  year: string;
}

export interface Settings {
  theme: ThemePref;
  proactiveAria: boolean;
  haptics: boolean;
  notifications: boolean;
}

/** Effective "today" for the whole app — overridable so the demo can jump dates. */
export const DEFAULT_DEMO_DATE = '2026-07-23';

export const DEFAULT_PROFILE: Profile = {
  name: 'Maya',
  email: 'maya@university.edu',
  school: 'State University',
  year: 'Sophomore',
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
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

const SEED_TASKS: Task[] = [
  {
    id: 'seed-jane-birthday',
    title: "Wish Jane a happy birthday",
    description: "Jane from study group — she's turning 21.",
    date: '2026-07-30',
    priority: 'medium',
    kind: 'birthday',
    status: 'todo',
    subtasks: [],
    contactName: 'Jane',
    method: 'card',
    createdAt: '2026-07-10T09:00:00.000Z',
  },
  {
    id: 'seed-anniversary',
    title: "Mum & Dad's anniversary",
    description: 'Send a warm note to celebrate 25 years.',
    date: '2026-08-02',
    priority: 'medium',
    kind: 'anniversary',
    status: 'todo',
    subtasks: [],
    contactName: 'Mum',
    createdAt: '2026-07-12T09:00:00.000Z',
  },
  {
    id: 'seed-history-essay',
    title: 'History essay: the Cold War',
    description: '1500 words on the causes of the Cold War. Due Tuesday.',
    date: '2026-07-28',
    priority: 'high',
    kind: 'assignment',
    status: 'todo',
    subtasks: [
      { id: uid(), title: 'Draft an outline', done: false },
      { id: uid(), title: 'Write introduction', done: false },
      { id: uid(), title: 'Cite sources', done: false },
    ],
    createdAt: '2026-07-15T09:00:00.000Z',
  },
  {
    id: 'seed-chem-lab',
    title: 'Chemistry lab report',
    description: 'Write up the titration experiment results.',
    date: '2026-07-24',
    priority: 'high',
    kind: 'assignment',
    status: 'todo',
    subtasks: [
      { id: uid(), title: 'Plot the data', done: true },
      { id: uid(), title: 'Analysis section', done: false },
    ],
    createdAt: '2026-07-16T09:00:00.000Z',
  },
  {
    id: 'seed-america-essay',
    title: 'Essay on the history of America',
    description: '2000 words on the major eras. Due next week.',
    date: '2026-07-31',
    priority: 'high',
    kind: 'assignment',
    status: 'todo',
    subtasks: [],
    method: 'steps',
    createdAt: '2026-07-24T09:00:00.000Z',
  },
  {
    id: 'seed-email-prof',
    title: 'Email Professor Lee about extension',
    description: 'Ask for two extra days on the stats problem set.',
    date: '2026-07-23',
    priority: 'high',
    kind: 'general',
    status: 'todo',
    subtasks: [],
    contactName: 'Professor Lee',
    contactEmail: 'd.lee@university.edu',
    method: 'email',
    createdAt: '2026-07-20T09:00:00.000Z',
  },
  {
    id: 'seed-alex',
    title: 'Congratulate Alex on the new job',
    date: '2026-07-23',
    priority: 'low',
    kind: 'general',
    status: 'todo',
    subtasks: [],
    contactName: 'Alex',
    createdAt: '2026-07-21T09:00:00.000Z',
  },
  {
    id: 'seed-gym',
    title: 'Gym session',
    date: '2026-07-25',
    priority: 'low',
    kind: 'general',
    status: 'todo',
    subtasks: [],
    createdAt: '2026-07-19T09:00:00.000Z',
  },
  {
    id: 'seed-study-group',
    title: 'Study group at the library',
    date: '2026-07-27',
    priority: 'medium',
    kind: 'general',
    status: 'todo',
    subtasks: [],
    createdAt: '2026-07-19T09:00:00.000Z',
  },
  {
    id: 'seed-return-books',
    title: 'Return library books',
    description: 'Two overdue since last week.',
    date: '2026-07-21',
    priority: 'medium',
    kind: 'general',
    status: 'todo',
    subtasks: [],
    createdAt: '2026-07-14T09:00:00.000Z',
  },
  {
    id: 'seed-fafsa',
    title: 'Submit financial aid form',
    date: '2026-07-18',
    priority: 'high',
    kind: 'general',
    status: 'done',
    subtasks: [],
    createdAt: '2026-07-08T09:00:00.000Z',
    completedAt: '2026-07-17T14:00:00.000Z',
  },
  {
    id: 'seed-reading',
    title: 'Finish sociology reading',
    date: '2026-07-20',
    priority: 'low',
    kind: 'assignment',
    status: 'done',
    subtasks: [],
    createdAt: '2026-07-13T09:00:00.000Z',
    completedAt: '2026-07-20T20:00:00.000Z',
  },
];

export const OVERLOAD_THRESHOLD = 5;

interface AriaState {
  tasks: Task[];
  demoDate: string;
  profile: Profile;
  settings: Settings;
  contacts: Contact[]; // Maya's own saved contacts
  signedIn: boolean;
  onboarded: boolean; // false right after a new signup, until the welcome is done
  hydrated: boolean;
  setHydrated: () => void;
  setDemoDate: (date: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  signIn: (input: { name?: string; email?: string; isNew?: boolean }) => void;
  signOut: () => void;
  completeOnboarding: () => void;
  addContact: (contact: Contact) => void;
  addTask: (input: {
    title: string;
    date: string;
    priority: Priority;
    kind: TaskKind;
    description?: string;
    contactName?: string;
    contactEmail?: string;
    method?: TaskMethod;
    time?: string;
    subtasks?: Subtask[];
  }) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addDraftSection: (taskId: string, section: DraftSection) => void;
  addSubtasks: (taskId: string, titles: string[]) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  completeTask: (id: string, opts?: { byAria?: boolean }) => void;
  reopenTask: (id: string) => void;
  rescheduleTask: (id: string, date: string) => void;
  deleteTask: (id: string) => void;
  resetDemo: () => void;
}

export const useAriaStore = create<AriaState>()(
  persist(
    (set) => ({
      tasks: SEED_TASKS,
      demoDate: DEFAULT_DEMO_DATE,
      profile: DEFAULT_PROFILE,
      settings: DEFAULT_SETTINGS,
      contacts: SEED_CONTACTS,
      signedIn: false,
      onboarded: true,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      setDemoDate: (date) => set({ demoDate: date }),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      signIn: (input) =>
        set((s) => ({
          signedIn: true,
          // New account: start fresh — no tasks or contacts, and show the welcome.
          onboarded: input.isNew ? false : s.onboarded,
          tasks: input.isNew ? [] : s.tasks,
          contacts: input.isNew ? [] : s.contacts,
          demoDate: input.isNew ? DEFAULT_DEMO_DATE : s.demoDate,
          profile: {
            ...s.profile,
            ...(input.name ? { name: input.name } : {}),
            ...(input.email ? { email: input.email } : {}),
          },
        })),
      signOut: () => set({ signedIn: false }),
      completeOnboarding: () => set({ onboarded: true }),
      addContact: (contact) =>
        set((s) => {
          const key = (c: Contact) => `${c.name.trim().toLowerCase()}|${(c.email ?? '').toLowerCase()}`;
          if (s.contacts.some((c) => key(c) === key(contact))) return s;
          return { contacts: [...s.contacts, contact] };
        }),
      addTask: (input) => {
        const id = uid();
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
          method: input.method,
          time: input.time || undefined,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return id;
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      addDraftSection: (taskId, section) =>
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
        })),
      addSubtasks: (taskId, titles) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: [...t.subtasks, ...titles.map((title) => newDraftSubtask(title))] }
              : t,
          ),
        })),
      toggleSubtask: (taskId, subtaskId) =>
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
        })),
      completeTask: (id, opts) =>
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
        })),
      reopenTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, status: 'todo', completedAt: undefined, handledByAria: false } : t,
          ),
        })),
      rescheduleTask: (id, date) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, date } : t)) })),
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      resetDemo: () => set({ tasks: SEED_TASKS, demoDate: DEFAULT_DEMO_DATE, contacts: SEED_CONTACTS }),
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
        signedIn: s.signedIn,
        onboarded: s.onboarded,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

// ---- Selectors / derived helpers (pure; take the current task list + demoDate) ----

export function sortByDate(a: Task, b: Task) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

export function selectUpcoming(tasks: Task[], demoDate: string) {
  return tasks.filter((t) => t.status === 'todo' && t.date >= demoDate).sort(sortByDate);
}

export function selectLate(tasks: Task[], demoDate: string) {
  return tasks.filter((t) => t.status === 'todo' && t.date < demoDate).sort(sortByDate);
}

export function selectDone(tasks: Task[]) {
  return tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

export function selectToday(tasks: Task[], demoDate: string) {
  return tasks.filter((t) => t.status === 'todo' && t.date === demoDate).sort(sortByDate);
}

export interface WeekLoad {
  count: number;
  overloaded: boolean;
  tasks: Task[];
}

export function selectWeekLoad(tasks: Task[], demoDate: string): WeekLoad {
  const ref = parseISO(demoDate);
  const inWeek = tasks.filter(
    (t) => t.status === 'todo' && isSameWeek(parseISO(t.date), ref, { weekStartsOn: 1 }),
  );
  return { count: inWeek.length, overloaded: inWeek.length >= OVERLOAD_THRESHOLD, tasks: inWeek };
}

export function isLate(task: Task, demoDate: string) {
  return task.status === 'todo' && isBefore(parseISO(task.date), parseISO(demoDate));
}
