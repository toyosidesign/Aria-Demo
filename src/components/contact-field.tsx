import { Check, ChevronDown, Users, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { initials, isValidEmails, type Contact } from '@/lib/contacts';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

export function ContactField({
  label,
  name,
  onName,
  email,
  onEmail,
  requireEmail,
}: {
  label: string;
  name: string;
  onName: (name: string) => void;
  email: string;
  onEmail: (email: string) => void;
  requireEmail: boolean;
}) {
  const c = useColors();
  const contacts = useAriaStore((s) => s.contacts);
  const addContact = useAriaStore((s) => s.addContact);
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const q = name.trim().toLowerCase();
  const results = q ? contacts.filter((ct) => ct.name.toLowerCase().includes(q)) : contacts;
  const existing = contacts.some((ct) => ct.name.trim().toLowerCase() === q && q.length > 0);
  const emailOk = !requireEmail || isValidEmails(email);
  const canSaveNew = q.length > 0 && !existing && emailOk;

  function select(ct: Contact) {
    hapticSelect();
    onName(ct.name);
    if (ct.email) onEmail(ct.email);
    setOpen(false);
  }

  function saveNew() {
    hapticSelect();
    addContact({
      id: `ct-${q.replace(/\s+/g, '-')}-${email.trim().toLowerCase()}`,
      name: name.trim(),
      email: email.trim() || undefined,
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  }

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {label}
      </Text>

      <View className="flex-row items-center rounded-2xl border border-border bg-surface pr-1">
        <TextInput
          value={name}
          onChangeText={onName}
          placeholder="Type a name"
          placeholderTextColor={c.faint}
          className="h-12 flex-1 px-4 text-base text-ink"
        />
        <Pressable
          onPress={() => setOpen((o) => !o)}
          hitSlop={8}
          className="flex-row items-center gap-1 px-3 py-2 active:opacity-60">
          <Users size={18} color={c.accent} />
          <ChevronDown size={14} color={c.muted} />
        </Pressable>
      </View>

      {open ? (
        <View className="gap-0.5 rounded-2xl border border-border bg-surface p-1.5">
          {contacts.length === 0 ? (
            <Text tone="faint" variant="small" className="p-3">
              No saved contacts yet. Type a name (and email, if needed) — I&apos;ll remember them for
              next time.
            </Text>
          ) : results.length === 0 ? (
            <Text tone="faint" variant="small" className="p-3">
              No saved contact matches “{name}”. Type it to use as-is.
            </Text>
          ) : (
            results.map((ct) => (
              <Pressable
                key={ct.id}
                onPress={() => select(ct)}
                className="flex-row items-center gap-3 rounded-xl p-2.5 active:bg-accent-soft">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
                  <Text variant="small" tone="accent" className="font-bold">
                    {initials(ct.name)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text variant="small" className="font-semibold">
                    {ct.name}
                  </Text>
                  <Text variant="caption" tone="faint" numberOfLines={1}>
                    {ct.email ?? ct.phone ?? 'No email saved'}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {requireEmail ? (
        <View className="gap-1">
          <Input
            label="To (email)"
            placeholder="name@email.com — separate multiple with commas"
            value={email}
            onChangeText={onEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {email.trim() && !isValidEmails(email) ? (
            <Text variant="caption" tone="danger" className="px-1">
              Enter a valid email address.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Save a new person to Maya's contacts */}
      {justSaved ? (
        <View className="flex-row items-center gap-1.5 px-1">
          <Check size={14} color={c.success} />
          <Text variant="caption" style={{ color: c.success }} className="font-semibold">
            Saved to your contacts
          </Text>
        </View>
      ) : canSaveNew ? (
        <Pressable
          onPress={saveNew}
          className="flex-row items-center gap-1.5 self-start rounded-full border border-border bg-surface px-3 py-1.5 active:opacity-70">
          <UserPlus size={14} color={c.accent} />
          <Text variant="caption" tone="accent" className="font-semibold">
            Save {name.trim()} to contacts
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
