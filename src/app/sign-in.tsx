import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CloseButton, closeModal } from '@/components/close-button';
import { GoogleButton } from '@/components/google-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { friendlyAuthError, isValidEmail } from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) return setError(friendlyAuthError(authError));
    closeModal();
  }

  return (
    <Screen title="Log in" subtitle="Welcome back! Your progress is waiting." modal topAction={<CloseButton />}>
      <GoogleButton onSignedIn={closeModal} onError={setError} />
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {error ? (
          <ThemedText themeColor="danger" role="alert">
            {error}
          </ThemedText>
        ) : null}
        <Button label="Log in" onPress={submit} loading={busy} />
        <Link href="/forgot-password" replace style={styles.center}>
          <ThemedText type="link">Forgot password?</ThemedText>
        </Link>
      </View>
      <View style={styles.footer}>
        <ThemedText themeColor="textSecondary">New here?</ThemedText>
        <Link href="/sign-up" replace>
          <ThemedText type="link">Create an account</ThemedText>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  center: { alignSelf: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
});
