import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, isSameWeek, parseISO } from 'date-fns';
import { Platform } from 'react-native';
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
import { DEFAULT_REVIEW_TIME, syncDailyReview } from '@/lib/daily-brief';
import { sampleDataPresent } from '@/lib/demo';
import type { Source } from '@/lib/source';
import { SYSTEM_DARK, SYSTEM_LIGHT, THEME_NAMES, type ThemePref } from '@/lib/themes';
import { showToast } from '@/lib/toast';
import { uuidv4 } from '@/lib/id';
import {
  cancelAutomationRow,
  deleteTaskRow,
  fetchAll,
  replaceAllAutomations,
  replaceAllContacts,
  replaceAllTasks,
  setSyncUser,
  settleAutomationRow,
  signOutRemote,
  upsertAutomation,
  upsertContact,
  upsertContacts,
  upsertProfile,
  upsertTask,
  upsertTasks,
} from '@/lib/sync';

/**
 * True only inside Expo Router's Node render of the web build.
 *
 * React Native defines `window`, and so does a browser; Node does not. Mirrors
 * the same constant in lib/supabase.ts, which skips session storage there for
 * exactly this reason.
 */
const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

/** A store that forgets everything, for the environment that has nowhere to put it. */
const noStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

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
  /**
   * The day this step was meant to be finished by. Work only.
   *
   * A checklist item has no date and never needed one. A plan step does: it is
   * what makes "behind schedule" a fact rather than a feeling, and without it
   * nothing can notice that a step has slipped.
   */
  due?: string;
  /**
   * What makes a milestone actually happen, a review, a demo, someone waiting.
   *
   * Collected because a milestone with nothing forcing it is the one that
   * moves. Kept on the step so the follow-up can say *what* was supposed to
   * force it, which is a more useful nudge than the date.
   */
  forcing?: string;
  /**
   * How many times this step has been pushed.
   *
   * Two is where the Guide gets offered, three is where Aria asks one question
   * and lets it go, see `rolloverVerdict` in lib/plan.ts. Undefined on
   * everything that is not a work step.
   */
  rollovers?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string; // ISO yyyy-MM-dd, the calendar date
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

/**
 * A task Aria has proposed in chat but nobody has created yet.
 *
 * Structurally the same as `ParsedTask` in lib/assistant.ts, declared here
 * rather than imported because that module imports *this* one, taking it the
 * other way would be a cycle. Assignment still works in both directions.
 */
export interface ProposedTask {
  title: string;
  date: string;
  time?: string;
  kind: TaskKind;
  priority: Priority;
  contactName?: string;
  contactEmail?: string;
  method?: TaskMethod;
  description?: string;
  subtasks?: string[];
}

/** One turn in the conversation with Aria. */
export interface ChatMessage {
  id: string;
  from: 'aria' | 'maya';
  text: string;
  /** Tasks offered in this turn, still waiting to be created. */
  pending?: ProposedTask[];
  /**
   * True when the scripted parser answered rather than the model.
   *
   * Rendered only in development. The fallback is deliberately good, it reads
   * like a real reply, which is precisely why a dead API key went unnoticed
   * for weeks. Being able to see which one answered is the difference between
   * testing Aria and testing the fallback.
   */
  fallback?: boolean;
  /**
   * True when this was a question from the guided setup.
   *
   * The thread persists and the flow does not, so a conversation can end on a
   * question nothing is still listening to. This is how the chat screen spots
   * that on reopen and says so instead of looking frozen.
   */
  flowPrompt?: boolean;
  /**
   * Renders as a labelled rule instead of a bubble.
   *
   * One thread holds every task Aria has ever set up, so a finished birthday
   * and the assignment started after it ran together as one long conversation
   * with no seam. This is the seam.
   */
  divider?: string;
  /**
   * The pages behind a researched answer.
   *
   * Persisted with the message rather than held in memory: the thread outlives
   * the session, and an answer that could be checked yesterday and cannot be
   * checked today is the worst of both. Absent on answers from memory, which is
   * how the screen knows not to imply a provenance that does not exist.
   */
  sources?: Source[];
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

export type { ThemePref } from '@/lib/themes';

/**
 * How much scaffolding this person wants around an explanation.
 *
 * Not a learning-style claim, it's a stated preference about pacing and
 * framing, which is something someone can actually answer about themselves.
 */
export type ExplainStyle = 'direct' | 'examples' | 'stepwise';

/**
 * Which of the three kinds of work someone is here for.
 *
 * Onboarding used to open with "What are you studying?", which decided the
 * answer inside the question: someone employed, or running their own thing, had
 * to either lie or skip. It also quietly mis-set every prompt, `describeLearner`
 * opened with "You are helping a student" for all of them.
 *
 * It matters beyond the greeting. The Guide withholds prose for an assignment
 * because the student is being marked; nobody is marking a freelancer's own
 * project, and hedging at them would be a worse product for no reason.
 */
export type WorkRole = 'student' | 'employed' | 'independent';

export interface Profile {
  name: string;
  email: string;
  /**
   * One line on who they are, "Sophomore at State University", "Product
   * designer at Acme", "Freelance, two kids". Replaces the old school/year
   * pair, which assumed university and did nothing but sit on the profile.
   * This one feeds Aria's prompts, so it changes how drafts actually read.
   */
  context: string;
  /** Local file URI or remote URL of the profile picture. Falls back to initials. */
  avatarUri?: string;
  /** Studying, employed, or running their own thing. The first question asked. */
  role?: WorkRole;
  /**
   * Their subject or their field, "Law", "Mechanical Engineering", "Product
   * design", "A design studio".
   *
   * One field for all three roles because it plays one part in every prompt:
   * it is what lets Aria break work into steps that belong to the actual
   * subject rather than generic scaffolding. `role` is what says how to read
   * it.
   */
  studying?: string;
  /** How far in, "2nd year", "Postgrad". Students only; sets the depth. */
  level?: string;
  /**
   * The things they're into.
   *
   * This is the one that makes Aria different from a planner: a student who
   * plays basketball can have projectile motion explained through a jump shot.
   * Useless as decoration, load-bearing once it reaches the prompts.
   */
  interests?: string[];
  /** How they want things explained. */
  explainStyle?: ExplainStyle;
}

export interface Settings {
  theme: ThemePref;
  proactiveAria: boolean;
  haptics: boolean;
  notifications: boolean;
  /**
   * Send at the scheduled moment without asking first. Pro only.
   *
   * Off means Aria still does the work, drafts it, addresses it, has it
   * waiting, and asks before anything leaves. On means it goes.
   *
   * Deliberately **not** a device preference like `theme`. The cron sends with
   * nobody watching and no device involved, so this has to be readable from the
   * server or it cannot govern the thing it exists to govern. It lives in the
   * `profiles` row (migration 005) and the Edge Function reads it there.
   *
   * Defaults off, and stays off for anyone without Pro, see `autoSendEnabled`,
   * which is the only correct way to ask this question. The raw flag can be
   * true on an account whose Pro has lapsed.
   */
  autoSend: boolean;
  /**
   * The daily review prompt, and when it arrives. Pro only.
   *
   * On by default *for Pro*, because the review is what Pro is: an account that
   * pays for Aria to work behind the scenes and is never asked to approve
   * anything has bought a label. Free accounts never see it, whatever this
   * says, and `syncDailyReview` is the single place that decides.
   */
  dailyReview: boolean;
  /** HH:mm. Early, before the day has started. */
  reviewTime: string;
  /**
   * Weekdays that are always spoken for. 0 = Sunday.
   *
   * Lectures, a shift, a standing commitment, the part of someone's week the
   * app cannot read off its own calendar. Asked once, on the first assignment
   * that needs a plan, and reused by every one after it: "I have labs on
   * Wednesdays" is not a per-assignment fact.
   *
   * Local, like `theme`, and for a related reason, there is no column for it
   * and no server-side reader that needs it. It is in `settings` so it resets
   * with the account rather than being inherited by whoever signs in next.
   */
  fixedDays?: number[];
}

/** Effective "today" for the whole app, the real current date, overridable so
 *  the demo can jump to a future date. */
export const DEFAULT_DEMO_DATE = toISODate(new Date());

export const DEFAULT_PROFILE: Profile = {
  name: 'Maya',
  email: 'maya@university.edu',
  context: 'Sophomore at State University',
  studying: 'Psychology',
  level: '2nd year',
  interests: ['Basketball', 'Music'],
  explainStyle: 'examples',
};

export const DEFAULT_SETTINGS: Settings = {
  /**
   * A fixed theme, not 'system'.
   *
   * Following the device means the app changes appearance on its own, light at
   * noon, dark at night, which is a thing to be agreed to rather than assumed.
   * Defaulting to 'system' switched it on for everyone and left the toggle in
   * Settings as the only way to find out it was happening.
   *
   * So it starts on one theme and stays there. "Match my device" in Settings is
   * the opt-in, and turning it on is the consent.
   */
  theme: SYSTEM_LIGHT,
  proactiveAria: true,
  haptics: true,
  notifications: true,
  /*
   * Off, on the same reasoning as `theme` above: sending on someone's behalf
   * without asking is a thing to be agreed to, not assumed. Defaulting it on
   * would mean the first a student hears of it is an email their contact
   * already received.
   */
  autoSend: false,
  dailyReview: true,
  reviewTime: DEFAULT_REVIEW_TIME,
};

/**
 * Whether Aria may send without asking.
 *
 * The only correct way to ask. `settings.autoSend` on its own is not the
 * answer: Pro can lapse while the stored preference stays true, and reading the
 * raw flag would keep sending for an account that no longer pays for it. Both
 * conditions, every time.
 */
export function autoSendEnabled(settings: Settings, pro: boolean): boolean {
  return pro && settings.autoSend;
}

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
 * story, a couple due today, some overdue, some coming up, on any date.
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

/**
 * How much of the conversation is kept.
 *
 * Enough that scrolling back feels complete, bounded so the persisted store
 * doesn't grow forever on a device that never signs out.
 */
export const CHAT_LIMIT = 200;

interface AriaState {
  tasks: Task[];
  demoDate: string;
  profile: Profile;
  settings: Settings;
  contacts: Contact[]; // Maya's own saved contacts
  automations: Automation[]; // work Aria runs at a scheduled moment
  /**
   * Who signed in here last. Survives sign-out on purpose, it's what lets the
   * login screen greet a returning user by name instead of treating every
   * visit as a first one. Name and email only; never a credential.
   */
  lastUser: { name: string; email: string } | null;
  pro: boolean; // Aria Pro, unlocks scheduled automations + every integration
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
  /** Dev only: re-run the welcome flow. See the implementation. */
  replayOnboarding: () => void;
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
   *  put it, confirming before the user has decided reads as a lie. */
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
   * The counterpart to `resetDemo`, which only ever *restores* the samples , 
   * there was no way out of demo data short of deleting each task by hand, so
   * the home screen's offer to "clear them and start on your own" was a promise
   * the app couldn't keep.
   *
   * Deliberately leaves the account alone: profile, settings and sign-in state
   * survive. This clears what's *in* the planner, it doesn't reset the app.
   */
  /**
   * Which rows are the sample ones.
   *
   * Recorded rather than recognised: `tasks.id` is a `uuid` column, so a
   * readable `seed-` id cannot be written to the server, and a fixed uuid per
   * sample would collide as soon as a second account inserted the same row. So
   * every copy gets a fresh uuid and its id is kept here.
   *
   * This is what makes removing the samples safe. Anything created afterwards
   * is not in the list and is never touched.
   */
  sampleIds: string[];
  /**
   * The last day whose review was approved, as yyyy-MM-dd.
   *
   * What stops the card asking again once somebody has answered it, and what
   * makes "approved" a fact the screen can state rather than a mood. Per person,
   * because approving a day is a decision somebody made about their own work.
   */
  lastReviewedOn: string | null;
  /** Record that today's review has been answered. */
  markDayReviewed: (date: string) => void;
  /**
   * Add the sample tasks and contacts, or take them away.
   *
   * The onboarding switch and the empty-state card on Today both call this.
   * Off removes only what is in `sampleIds`; on adds a fresh copy, and does
   * nothing when they are already there.
   */
  setSampleData: (on: boolean) => void;
  clearAllData: () => void;
  /**
   * Whether the "try the sample data" offer on the home screen has been
   * answered. Set either way, taking the tour or declining it both count, so
   * the card asks once and never again.
   */
  /**
   * Whose data is currently on this device.
   *
   * Lets `hydrate` tell "the same person is back" from "somebody else has
   * signed in", which is the only moment local data genuinely has to be thrown
   * away. Persisted, because the distinction has to survive a restart.
   */
  lastUserId: string | null;
  demoOfferDismissed: boolean;
  dismissDemoOffer: () => void;
  /**
   * The conversation with Aria, kept across closes.
   *
   * It lived in the chat screen's own state, so shutting the sheet threw the
   * whole thread away, including tasks Aria had offered but nobody had tapped
   * yet. Capped at CHAT_LIMIT so a long-running account can't grow the stored
   * blob without bound.
   */
  chat: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
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
      /*
       * Empty until somebody asks for the samples.
       *
       * They used to be seeded here, which meant a new account opened onto a
       * planner holding Jane's birthday, a chemistry lab report and a group
       * project it had never been told about. Two things were wrong with that.
       * The onboarding switch offering "show me around with sample tasks" was
       * describing something that had already happened, and the empty-state
       * card on Today, the one that offers exactly this, could never appear:
       * it renders only when there are no tasks.
       *
       * So the samples are opt-in, from either of those two places, and both
       * go through `setSampleData` / `resetDemo`. What someone sees before they
       * answer is their own empty planner, which is the truth.
       */
      tasks: [],
      sampleIds: [],
      lastReviewedOn: null,
      demoDate: DEFAULT_DEMO_DATE,
      profile: DEFAULT_PROFILE,
      settings: DEFAULT_SETTINGS,
      // Sample people belong with the sample tasks: a planner with nothing in
      // it and a contact list holding eight strangers is a stranger mix still.
      contacts: [],
      automations: [],
      lastUser: null,
      pro: false,
      proWaitlisted: false,
      signedIn: false,
      onboarded: true,
      lastUserId: null,
      demoOfferDismissed: false,
      chat: [],
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      setDemoDate: (date) => set({ demoDate: date }),
      updateProfile: (patch) => {
        set((s) => ({ profile: { ...s.profile, ...patch } }));
        upsertProfile(get().profile, get().settings, get().onboarded, get().pro);
      },
      setPro: (pro) => {
        set({ pro });
        /*
         * The review prompt is the shape Pro takes, so it starts and stops with
         * it. Cancelling on the way down matters more than booking on the way
         * up: an account that lapses must stop being told Aria will handle its
         * day, because it no longer will.
         */
        void syncDailyReview({
          pro,
          enabled: get().settings.dailyReview,
          time: get().settings.reviewTime,
          notifications: get().settings.notifications,
        });
        /*
         * Pro has to reach the server, not just the device.
         *
         * The cron sends with no session and reads entitlement from
         * `profiles.pro`. This only ever set local state, so the flag never
         * left the phone: the runner saw `pro: false` for everyone, failed
         * closed as designed, and held every automation. Autonomous sending
         * could not have worked at all, and nothing about it would have looked
         * broken from inside the app.
         */
        upsertProfile(get().profile, get().settings, get().onboarded, pro);
      },
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
        // stop new ones, otherwise alarms keep arriving after you said no.
        if (key === 'notifications') {
          setNotificationsEnabled(value as boolean);
          void reconcileAlarms(get().tasks);
          void reconcileAutomationNotices(get().automations);
        }
        /*
         * The daily prompt follows three switches, so it is rebooked whenever
         * any of them moves rather than only when its own does.
         *
         * Turning notifications off has to silence it too: a review prompt is a
         * notification whatever menu it lives under, and leaving it ringing
         * after somebody said no is the same broken promise the alarms above
         * were fixed for.
         */
        if (key === 'notifications' || key === 'dailyReview' || key === 'reviewTime') {
          void syncDailyReview({
            pro: get().pro,
            enabled: get().settings.dailyReview,
            time: get().settings.reviewTime,
            notifications: get().settings.notifications,
          });
        }
        upsertProfile(get().profile, get().settings, get().onboarded, get().pro);
      },
      signIn: (input) =>
        set((s) => ({
          signedIn: true,
          lastUser: {
            name: input.name?.trim() || s.lastUser?.name || s.profile.name,
            email: input.email?.trim() || s.lastUser?.email || s.profile.email,
          },
          // New account: start fresh, no tasks or contacts, and show the welcome.
          onboarded: input.isNew ? false : s.onboarded,
          tasks: input.isNew ? [] : s.tasks,
          contacts: input.isNew ? [] : s.contacts,
          demoDate: input.isNew ? DEFAULT_DEMO_DATE : s.demoDate,
          // A fresh account gets the offer again, the previous person's answer
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
        // Somebody else signing in on this handset is the real reason to clear
        // local data, not a session that happened to be missing at launch.
        const previous = get().lastUserId;

        if (previous && previous !== userId) {
          /*
           * A different account. The one moment everything personal has to go , 
           * see PERSISTED STATE at the persist config for the full list.
           *
           * `settings` is in here because of `theme`: appearance is a choice a
           * person made, and a student signing up on a friend's phone
           * inheriting Charcoal is the same class of bug as inheriting their
           * completed onboarding.
           */
          set({
            tasks: [],
            sampleIds: [],
            lastReviewedOn: null,
            contacts: [],
            automations: [],
            chat: [],
            profile: DEFAULT_PROFILE,
            settings: DEFAULT_SETTINGS,
            onboarded: false,
            demoOfferDismissed: false,
          });
        } else if (!previous) {
          /*
           * We have never recorded whose device this is.
           *
           * True on a fresh install, and on any device that signed out while
           * `clearLocal` still cleared this marker. Either way the local
           * `onboarded` flag can't be attributed to the account now signing in,
           * so it isn't evidence, the server's row is. Clearing it lets the
           * merge below resolve from the remote: a returning user's row says
           * true and they skip onboarding, a new signup's says false and they
           * see it.
           *
           * Only the flag is cleared, never content. Local tasks on an
           * unidentified device may be the only copy in existence, and "not
           * sure whose phone this is" is nowhere near reason enough to delete
           * them.
           */
          set({ onboarded: false });
        }

        set({ lastUserId: userId });
        const data = await fetchAll(userId);
        if (!data) {
          // Offline, or the fetch failed: keep the cached data untouched.
          set({ signedIn: true });
          void reconcileAlarms(get().tasks);
          return;
        }
        // Hydrating must never destroy local work. An empty remote set means
        // "nothing has synced up yet", not "this account has nothing", keep
        // what's on the device and push it up instead.
        const localTasks = get().tasks;
        const localContacts = get().contacts;
        const localAutomations = get().automations;
        const remembered = get().lastUser;
        const remote = data.profile ? definedFields(data.profile) : {};
        // A profile row created by the signup trigger carries only an email, so
        // the name arrives blank. Fall back to what was typed at signup rather
        // than to DEFAULT_PROFILE, which would greet everyone as the demo persona.
        const name = remote.name || remembered?.name;
        set((s) => ({
          signedIn: true,
          profile: { ...s.profile, ...(name ? { name } : {}), ...remote },
          // Merge, don't replace. A remote row only reports the columns it has
          // set, so anything it is silent about keeps the device's value , 
          // otherwise a bare profile row resets the theme on every launch.
          settings: { ...s.settings, ...(data.settings ?? {}) },
          onboarded: data.onboarded || s.onboarded,
          tasks: data.tasks.length ? data.tasks : s.tasks,
          contacts: data.contacts.length ? data.contacts : s.contacts,
          /*
           * The remote list wins outright when it has anything, and this is the
           * one place where that matters for correctness rather than tidiness.
           *
           * The server is where automations are actually run from now, so its
           * copy is the one that knows whether Friday's email went. A device
           * that was asleep at 09:00 still has the row as 'scheduled'; merging
           * by preferring the local value would keep showing it as pending
           * forever, and, worse, leave it looking due to the run screen.
           */
          automations: data.automations.length ? data.automations : s.automations,
        }));
        setNotificationsEnabled(get().settings.notifications);
        const profile = get().profile;
        if (profile.name || profile.email) {
          set({ lastUser: { name: profile.name, email: profile.email } });
        }
        // Repair the remote row so the name is there next time, on any device.
        if (!remote.name && profile.name) {
          upsertProfile(profile, get().settings, get().onboarded, get().pro);
        }
        if (!data.tasks.length && localTasks.length) void upsertTasks(localTasks);
        if (!data.contacts.length && localContacts.length) void upsertContacts(localContacts);
        /*
         * Automations scheduled before this device ever synced, including
         * every one made by a build that predates the table, get pushed up so
         * the cron can see them at all. One write each rather than a bulk
         * insert, deliberately: these go through the outbox, so the ones that
         * fail here are retried on the next foreground instead of being lost,
         * and an automation that never reaches the server is one that will
         * never fire while the app is closed.
         */
        if (!data.automations.length && localAutomations.length) {
          for (const a of localAutomations) upsertAutomation(a);
        }
        void reconcileAlarms(get().tasks);
      },
      /**
       * Wipe this device of the signed-in person's data.
       *
       * Only ever correct on a deliberate sign-out. It used to be called
       * whenever a session lookup came back empty at startup, which is not the
       * same thing at all: an expired token, a failed refresh or simply being
       * offline for a moment all look identical from here. Overnight the access
       * token expires, and the next launch destroyed every task, contact and
       * message on the device, permanently, since none of it had synced.
       */
      clearLocal: () => {
        setSyncUser(null);
        set({
          signedIn: false,
          tasks: [],
          contacts: [],
          automations: [],
          chat: [],
          profile: DEFAULT_PROFILE,
        });
        /*
         * `lastUserId` deliberately survives.
         *
         * It is the only way to tell "the same person came back" from "someone
         * else is signing in", and those want opposite treatment: the first
         * should keep their theme and not be walked through onboarding again,
         * the second should inherit nothing. Clearing it here would collapse
         * both into "unknown", and the per-person reset below could never fire.
         *
         * It is an opaque id, not data, the account's actual content is wiped
         * above.
         */
      },
      /**
       * Send yourself back through onboarding.
       *
       * A development affordance. Onboarding runs once per account, which makes
       * it the hardest screen in the app to iterate on, every look at it
       * otherwise costs a sign-out, a deleted account and a fresh signup. The
       * auth gate watches `onboarded`, so clearing it is all that's needed;
       * `/welcome` follows on its own.
       *
       * Answers are left alone deliberately. This is for seeing the flow again,
       * not for wiping a profile, Start fresh already does that.
       */
      replayOnboarding: () => set({ onboarded: false }),
      completeOnboarding: () => {
        /*
         * Also re-arms the demo offer.
         *
         * `signIn` resets it for a new account, but that only runs on the
         * development mock path, a real Supabase signup goes through the auth
         * gate instead and never calls it. So the flag kept whatever the device
         * already had, and since resetting the demo, clearing all data and
         * dismissing the card all set it to true, a fresh account on a
         * previously-used device was never offered the tour at all.
         *
         * Onboarding only runs for a new account, which makes it the honest
         * place to say "this person hasn't been asked yet".
         */
        set({ onboarded: true, demoOfferDismissed: false });
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
        // Server-side first, because that is what can act without this device.
        // The notification below is the fallback for the same moment, not the
        // mechanism: it only fires if the phone is on and reachable, and it
        // still needs the student to tap it.
        upsertAutomation(automation);
        /*
         * The nudge is for the ones Aria cannot send itself.
         *
         * This notification predates the scheduler: it existed so the student
         * could be told to open the app at the right moment and press send.
         * With the cron live and autonomous sending on, an email now gets both
         *, the server sends it, and the phone still asks you to go and do it
         *, which reads as the automation having failed when it has just
         * succeeded.
         *
         * Only email can be sent unattended, so only email skips the nudge.
         * A text or a WhatsApp message always needs a human, whatever the
         * setting says, because no mobile OS lets an app send one as the user.
         */
        const sendsItself =
          automation.channel === 'email' && autoSendEnabled(get().settings, get().pro);
        if (!sendsItself) void scheduleAutomationNotice(automation);
        return id;
      },
      cancelAutomation: (id) => {
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id ? { ...a, status: 'cancelled' as const } : a,
          ),
        }));
        // Cancelling has to reach the server or it hasn't happened, the cron
        // is holding the only copy that can still send it.
        cancelAutomationRow(id);
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
        settleAutomationRow(id, outcome.status, outcome.error);
        void cancelAutomationNotice(id);
        // Sending was the whole task, check it off the same way Aria does
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
        set({
          tasks,
          demoDate: DEFAULT_DEMO_DATE,
          contacts,
          automations: [],
          demoOfferDismissed: true,
          sampleIds: [...tasks, ...contacts].map((r) => r.id),
        });
        void replaceAllTasks(tasks);
        void upsertContacts(contacts);
        // Clearing the list locally is not enough now that the cron holds a
        // copy: rows left behind would still send, for tasks that no longer
        // exist in the app the student is looking at.
        void replaceAllAutomations([]);
      },
      setSampleData: (on) => {
        /*
         * The switch onboarding offers, and it has to be true both ways.
         *
         * It used to move the simulated date and nothing else, while the sample
         * tasks were seeded regardless, so somebody who never touched it still
         * arrived to a planner full of Jane's birthday and a chemistry lab
         * report they had never heard of. A control labelled "show me around
         * with sample tasks" has to be the thing that decides whether there are
         * sample tasks.
         *
         * ── Why the ids are recorded rather than recognised ──────────────────
         *
         * The samples were identifiable by a `seed-` id until they had to sync:
         * `tasks.id` is a `uuid` column, so a readable id cannot be written at
         * all, and a *fixed* uuid per sample would collide the moment a second
         * account inserted the same row. So each copy gets a fresh uuid and the
         * ids are remembered here instead.
         *
         * That list is what makes turning the switch off safe. Anything created
         * since is not in it and is never touched: a switch on a setup screen
         * must not be able to delete somebody's own work.
         */
        if (!on) {
          const sample = new Set(get().sampleIds);
          const tasks = get().tasks.filter((t) => !sample.has(t.id));
          const contacts = get().contacts.filter((c) => !sample.has(c.id));
          set({
            tasks,
            contacts,
            sampleIds: [],
            demoDate: DEFAULT_DEMO_DATE,
            demoOfferDismissed: true,
          });
          // Alarms outlive the tasks that scheduled them, so a removed sample
          // would otherwise still chime.
          void reconcileAlarms(tasks);
          void replaceAllTasks(tasks);
          void replaceAllContacts(contacts);
          return;
        }
        // Already there: nothing to add, and adding anyway would double them.
        // Asked of the rows, so a stale list cannot block the restore.
        const { tasks: current, contacts: currentContacts, sampleIds } = get();
        if (sampleDataPresent([...current, ...currentContacts].map((r) => r.id), sampleIds)) return;
        const fresh = buildSeedTasks().map((t) => ({ ...t, id: uuidv4() }));
        const freshContacts = SEED_CONTACTS.map((c) => ({ ...c, id: uuidv4() }));
        const tasks = [...get().tasks, ...fresh];
        const contacts = [...get().contacts, ...freshContacts];
        set({
          tasks,
          contacts,
          demoOfferDismissed: true,
          sampleIds: [...fresh, ...freshContacts].map((r) => r.id),
        });
        void reconcileAlarms(tasks);
        void replaceAllTasks(tasks);
        void upsertContacts(contacts);
      },
      clearAllData: () => {
        set({
          tasks: [],
          contacts: [],
          // The samples were among the rows just deleted. Leaving their ids
          // behind told the onboarding switch they were still there, so it
          // showed as on over an empty planner and then refused to add them.
          sampleIds: [],
          automations: [],
          // Back to the real calendar too: a simulated date is part of the demo,
          // and leaving it set would make an empty planner look broken.
          demoDate: DEFAULT_DEMO_DATE,
          // Nothing left to offer a tour of, and they've just declined it by
          // action, don't ask again on the now-empty home screen.
          demoOfferDismissed: true,
          chat: [],
        });
        // Alarms outlive the tasks that scheduled them, so a cleared planner
        // would otherwise still chime for something that no longer exists.
        void reconcileAlarms([]);
        void reconcileAutomationNotices([]);
        void replaceAllTasks([]);
        void replaceAllContacts([]);
        void replaceAllAutomations([]);
      },
      markDayReviewed: (date) => set({ lastReviewedOn: date }),
      dismissDemoOffer: () => set({ demoOfferDismissed: true }),
      addChatMessage: (message) =>
        set((st) => ({ chat: [...st.chat, message].slice(-CHAT_LIMIT) })),
      clearChat: () => set({ chat: [] }),
    }),
    {
      name: 'aria-store-v1',
      /*
       * Storage, and the one environment that has none.
       *
       * Expo Router server-renders the web build in Node to serve the `/api`
       * routes, and AsyncStorage's web path reaches for `window` the moment it
       * is asked to read or write. There is nothing to persist there and nobody
       * to persist it for, so it gets a store that does nothing: reads come back
       * empty and writes go nowhere, so the render sees the same defaults a
       * fresh install would.
       *
       * This is not theoretical. Setting the hydration flag unconditionally,
       * which is what stops the app hanging on the loading screen, made persist
       * write on the server and took the whole dev server down with
       * `ReferenceError: window is not defined`. Same guard as
       * `isServerRender` in lib/supabase.ts, and for the same reason.
       */
      storage: createJSONStorage(() => (isServerRender ? noStorage : AsyncStorage)),
      /*
       * ── PERSISTED STATE: what belongs to a PERSON vs a DEVICE ─────────────
       *
       * Everything below survives a restart. The distinction that matters is
       * who it belongs to, because that decides whether it must be cleared when
       * the account changes.
       *
       * Getting this wrong has produced the same bug three separate times, a
       * value set by one account silently inherited by the next:
       *
       *   · `theme`              a new signup opened the app in the previous
       *                          person's colour scheme
       *   · `demoOfferDismissed` one account declining the tour meant the next
       *                          was never offered it
       *   · `onboarded`          a new student was waved past the welcome flow,
       *                          so Aria learned nothing about them and every
       *                          draft was pitched at somebody else
       *
       * Each looked unrelated. All three were this.
       *
       * PER-PERSON, must reset on an account change. That happens in exactly
       * one place: the `previous !== userId` branch in `hydrate`. Add new keys
       * there, NOT to `clearLocal`.
       *   tasks, sampleIds, lastReviewedOn, contacts, automations, chat,
       *   profile, settings, onboarded, demoOfferDismissed, lastUser, pro,
       *   proWaitlisted
       *
       * PER-DEVICE / PER-SESSION, must NOT reset, or they defeat the thing
       * they exist for.
       *   lastUserId  the marker that detects the account change at all
       *   signedIn    session state, owned by the auth gate
       *   demoDate    a simulated date is a property of this demo install
       *
       * Signing out is NOT an account change. The same person signs back in
       * constantly, and resetting there would drop their theme and re-run
       * onboarding every time, which is exactly the bug one version of this
       * fix shipped with. `clearLocal` wipes content; only a genuinely
       * different user id wipes preferences.
       */
      partialize: (s) => ({
        tasks: s.tasks,
        // Which of those tasks are the samples. Persisted with them, or the
        // switch would forget what it added and lose the ability to take it
        // back after a restart.
        sampleIds: s.sampleIds,
        lastReviewedOn: s.lastReviewedOn,
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
        chat: s.chat,
        lastUserId: s.lastUserId,
      }),
      /*
       * Whatever happens here, the app has to open.
       *
       * `hydrated` is one of the gates in front of every screen, and
       * `setHydrated` used to be the last line after five migrations, behind an
       * early `return` for a missing state. So a storage read that failed, or
       * any one of those migrations throwing on an old stored shape, left the
       * loading screen up permanently with no way out but force-quitting.
       *
       * The migrations are all best-effort by nature: each one repairs data
       * from a shape the app no longer writes. Failing to repair is survivable.
       * Never opening is not.
       */
      onRehydrateStorage: () => (state, error) => {
        try {
          if (error) console.warn('[aria] could not read stored data, starting fresh:', error);
          if (!state) return;

          /*
           * Repair chat ids that collide.
           *
           * Messages used to be keyed by a counter that reset on every reload, so
           * a stored thread can already hold several `c0`s. Fresh ids are uuids
           * and won't collide, but the rows written before that still would, and
           * React refuses to render a list with duplicate keys.
           */
          const seenIds = new Set<string>();
          let repaired = false;
          state.chat = state.chat.map((m) => {
            if (!seenIds.has(m.id)) {
              seenIds.add(m.id);
              return m;
            }
            repaired = true;
            return { ...m, id: uuidv4() };
          });
          if (repaired) console.warn('[aria] repaired duplicate chat message ids');

          // Theme names have changed more than once, the setting was
          // 'system' | 'light' | 'dark', then gained 'paper' | 'mist' | 'cream',
          // which have since gone. Anything not currently offered is rewritten
          // rather than left to fall back on every read: a stale value would keep
          // the picker showing nothing selected.
          const storedTheme = state.settings.theme as string;
          const known: string[] = ['system', ...THEME_NAMES];
          if (!known.includes(storedTheme)) {
            const wasDark = storedTheme === 'dark' || storedTheme === 'charcoal';
            state.setSetting('theme', wasDark ? SYSTEM_DARK : SYSTEM_LIGHT);
          }

          // A previously persisted "today" that now sits in the past is a stale
          // default (simulated dates are always in the future), snap it to today
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
          // default profile carries a real-looking name, without that check a
          // brand-new install would be welcomed back as someone it's never met.
          if (!state.lastUser && state.signedIn && state.profile.name) {
            state.rememberUser({ name: state.profile.name, email: state.profile.email });
          }

        } catch (err) {
          console.warn('[aria] a stored-data migration failed, carrying on:', err);
        } finally {
          useAriaStore.getState().setHydrated();
        }
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

/** Still waiting, what the "Aria will handle" list shows. */
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
 * Overdue, an earlier day, or today with its time already gone.
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
 * Due today, and still in time.
 *
 * The complement of `isLate` within today: same day, but either no time set or
 * a time that hasn't come round yet. Deliberately exclusive of late, a task
 * can't be both "get to this today" and "you've missed this", and showing both
 * labels would say nothing.
 */
/**
 * How close a timed task has to be before it counts as due.
 *
 * Long enough to be a warning rather than a surprise, short enough that a task
 * set for the evening does not spend the whole day calling itself due.
 */
const DUE_SOON_MINUTES = 120;

export function isDueToday(task: Task, demoDate: string) {
  if (task.status !== 'todo') return false;
  if (task.date !== demoDate) return false;
  if (isLate(task, demoDate)) return false;

  /*
   * A reminder is never "due".
   *
   * Due means something has to be attended to or sent, a task, an assignment,
   * a project. A reminder does the opposite: it comes and finds you at its
   * moment, and nothing is owed until then. Marking one due asks for action
   * that has not been asked for.
   */
  if (isReminderOnly(task)) return false;

  /*
   * With a time set, due means the moment is near, not merely today.
   *
   * A task set for 6pm was showing as due at lunchtime, which reads as a demand
   * when the whole afternoon is still ahead of it. Without a time there is no
   * moment to be near, so the whole day is the window.
   */
  if (!task.time) return true;
  const at = parseISO(task.date);
  const [h, m] = task.time.split(':').map(Number);
  at.setHours(h || 0, m || 0, 0, 0);
  return at.getTime() - Date.now() <= DUE_SOON_MINUTES * 60_000;
}

/**
 * Whether a reminder's moment has actually arrived.
 *
 * Distinct from `isLate`: a reminder set for 3pm today hasn't rung at 2pm, but
 * it isn't late either. Answering "Got it" or "Snooze" before the thing has
 * happened is meaningless, so those only appear once this is true.
 *
 * A reminder with no time is treated as due for the whole of its day rather
 * than only at 23:59, otherwise an all-day reminder would sit unanswerable
 * until the day was practically over.
 */
export function hasReminderFired(task: Task, demoDate: string): boolean {
  if (task.date < demoDate) return true;
  if (task.date > demoDate) return false;
  return !task.time || isPastMoment(task.date, task.time);
}
