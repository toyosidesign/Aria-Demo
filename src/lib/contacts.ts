export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

/** Seed contacts for the demo persona. A new user starts with none. */
export const SEED_CONTACTS: Contact[] = [
  { id: 'ct-jane', name: 'Jane Miller', email: 'jane.miller@gmail.com', phone: '+1 (555) 0142' },
  { id: 'ct-sam', name: 'Sam Carter', email: 'sam.carter@gmail.com', phone: '+1 (555) 0173' },
  { id: 'ct-lee', name: 'Professor Lee', email: 'd.lee@university.edu', phone: '+1 (555) 0110' },
  { id: 'ct-alex', name: 'Alex Rivera', email: 'alex.rivera@gmail.com', phone: '+1 (555) 0128' },
  { id: 'ct-mom', name: 'Mom', email: 'linda.home@gmail.com', phone: '+1 (555) 0190' },
  { id: 'ct-priya', name: 'Priya Shah', email: 'priya.shah@gmail.com', phone: '+1 (555) 0155' },
  { id: 'ct-noah', name: 'Noah Kim', email: 'noah.kim@gmail.com', phone: '+1 (555) 0166' },
  { id: 'ct-emma', name: 'Emma Davis', email: 'emma.davis@gmail.com', phone: '+1 (555) 0139' },
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True if every comma-separated token is a valid email (and there's at least one). */
export function isValidEmails(value: string): boolean {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => EMAIL_RE.test(p));
}
