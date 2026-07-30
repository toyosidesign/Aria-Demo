import { BookUser, Mail, Phone, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { isValidEmails, isValidPhone } from '@/lib/contacts';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { phoneContactsAvailable, pickPhoneContact } from '@/lib/phone-contacts';

/**
 * Who a task is going to.
 *
 * The phone's own address book is the source of truth — Aria doesn't keep a
 * second copy of everyone you know. Pick someone and their details come with
 * them, so there's nothing left to type; the manual fields only appear for
 * someone who isn't in your contacts.
 */
export function ContactField({
  label,
  name,
  onName,
  email,
  onEmail,
  phone,
  onPhone,
  requireEmail,
  needsPhone,
  phoneOnly = false,
  nameError,
  emailError,
  phoneError,
}: {
  label: string;
  name: string;
  onName: (name: string) => void;
  email: string;
  onEmail: (email: string) => void;
  phone: string;
  onPhone: (phone: string) => void;
  /** Email method — a valid address is required before the task can be saved. */
  requireEmail: boolean;
  /** Text or call method — a number is what lets Aria open the app pre-filled. */
  needsPhone: boolean;
  /** A call only ever needs a number: no name to type, no address to collect. */
  phoneOnly?: boolean;
  /**
   * Set by the form once Save has been pressed on an incomplete task, so the
   * field that blocked it says so. Undefined is the normal state — these are
   * derived from the values, so they clear as soon as the field is filled.
   */
  nameError?: string;
  emailError?: string;
  phoneError?: string;
}) {
  const c = useColors();
  const canPickFromPhone = phoneContactsAvailable();
  const [fromPhone, setFromPhone] = useState(false);

  async function importFromPhone() {
    const contact = await pickPhoneContact();
    if (!contact) return;
    hapticSelect();
    onName(contact.name);
    onEmail(contact.email ?? '');
    onPhone(contact.phone ?? '');
    setFromPhone(true);
  }

  /** Back to typing it in — keeps whatever was picked so it can be edited. */
  function enterManually() {
    hapticSelect();
    setFromPhone(false);
  }

  // Even a picked contact can be missing the one detail this task needs.
  const missingEmail = requireEmail && !isValidEmails(email);
  const missingPhone = needsPhone && !phone.trim();

  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {label}
      </Text>

      {fromPhone ? (
        <>
          {/* Picked from the phone — everything's already here, nothing to ask */}
          <View className="flex-row items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-3.5">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-accent">
              <UserRound size={22} color={c.accentInk} strokeWidth={2} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="font-strong" numberOfLines={1}>
                {name}
              </Text>
              {email.trim() && !phoneOnly ? (
                <View className="flex-row items-center gap-1.5">
                  <Mail size={12} color={c.muted} />
                  <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                    {email}
                  </Text>
                </View>
              ) : null}
              {phone.trim() ? (
                <View className="flex-row items-center gap-1.5">
                  <Phone size={12} color={c.muted} />
                  <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                    {phone}
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={enterManually}
              hitSlop={8}
              accessibilityLabel="Clear this contact"
              className="h-8 w-8 items-center justify-center rounded-full active:bg-border/60">
              <X size={17} color={c.muted} />
            </Pressable>
          </View>

          <View className="flex-row gap-4">
            <Pressable onPress={importFromPhone} hitSlop={6} className="active:opacity-60">
              <Text variant="caption" tone="accent" className="font-strong">
                Pick someone else
              </Text>
            </Pressable>
            <Pressable onPress={enterManually} hitSlop={6} className="active:opacity-60">
              <Text variant="caption" tone="muted" className="font-strong">
                Edit details
              </Text>
            </Pressable>
          </View>

          {/* The exception: their card doesn't carry what this task needs */}
          {missingEmail && !phoneOnly ? (
            <View className="gap-1 pt-1">
              <Input
                label="Email"
                placeholder="name@email.com"
                value={email}
                onChangeText={onEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={emailError}
              />
              {emailError ? null : (
                <Text variant="caption" tone="muted">
                  {name.trim() || 'They'} doesn&apos;t have an email saved on your phone, and I need
                  one to send this.
                </Text>
              )}
            </View>
          ) : null}

          {missingPhone ? (
            <View className="gap-1 pt-1">
              <Input
                label="Phone number"
                placeholder="+1 (555) 000 0000"
                value={phone}
                onChangeText={onPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                error={phoneError}
              />
              {phoneError ? null : (
                <Text variant="caption" tone="muted">
                  No number saved for {name.trim() || 'them'}. Add one so Aria can reach them.
                </Text>
              )}
            </View>
          ) : null}
        </>
      ) : (
        <>
          {canPickFromPhone ? (
            <>
              <Pressable
                onPress={importFromPhone}
                className="flex-row items-center justify-center gap-2 rounded-2xl border border-accent bg-accent-soft py-3.5 active:opacity-70">
                <BookUser size={18} color={c.accent} />
                <Text tone="accent" className="font-strong">
                  Choose from your contacts
                </Text>
              </Pressable>
              <Text variant="caption" tone="faint">
                Or fill it in yourself below.
              </Text>
            </>
          ) : null}

          {!phoneOnly ? (
            <Input
              label="Name"
              placeholder="Who is it for?"
              value={name}
              onChangeText={onName}
              autoComplete="name"
              error={nameError}
            />
          ) : null}

          {!phoneOnly ? (
            <View className="gap-1">
              <Input
                label={requireEmail ? 'Email' : 'Email (optional)'}
                placeholder="name@email.com, separate multiple with commas"
                value={email}
                onChangeText={onEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                // A malformed address is wrong the moment it's typed, so that
                // one reports live. A *missing* one only becomes wrong when you
                // try to save, which is what `emailError` carries.
                error={
                  email.trim() && !isValidEmails(email)
                    ? 'Enter a valid email address.'
                    : emailError
                }
              />
            </View>
          ) : null}

          <View className="gap-1">
            <Input
              label={needsPhone ? 'Phone number' : 'Phone number (optional)'}
              placeholder="+1 (555) 000 0000"
              value={phone}
              onChangeText={onPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              // Same split as the email above: a malformed number is wrong
              // immediately, a missing one only once you try to save.
              error={
                phone.trim() && !isValidPhone(phone) ? 'Enter a valid phone number.' : phoneError
              }
            />
          </View>
        </>
      )}
    </View>
  );
}
