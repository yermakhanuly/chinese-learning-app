import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CloseButton, closeModal } from '@/components/close-button';
import { GoogleButton } from '@/components/google-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MIN_PASSWORD_LENGTH, friendlyAuthError, isValidEmail, passwordProblem } from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit() {
    if (!name.trim()) return setError('Tell us what to call you.');
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    setBusy(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (authError) return setError(friendlyAuthError(authError));
    // With email confirmation switched on (cloud), there is no session until the link is clicked.
    if (!data.session) return setCheckEmail(true);
    closeModal(); // Onboarding opens automatically for new accounts.
  }

  if (checkEmail) {
    return (
      <Screen title="Check your email" modal topAction={<CloseButton />}>
        <Card>
          <ThemedText>
            We sent a confirmation link to {email.trim()}. Open it on this device, then log in.
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Create account" subtitle="Save your progress and pick up on any device." modal topAction={<CloseButton />}>
      <GoogleButton onSignedIn={closeModal} onError={setError} />
      <View style={styles.form}>
        <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={50} />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          onSubmitEditing={submit}
        />
        {error ? (
          <ThemedText themeColor="danger" role="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button label="Create account" onPress={submit} loading={busy} />
      </View>
      <View style={styles.footer}>
        <ThemedText themeColor="textSecondary">Already have an account?</ThemedText>
        <Link href="/sign-in" replace>
          <ThemedText type="link">Log in</ThemedText>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
