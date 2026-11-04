import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CloseButton, closeModal } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { MIN_PASSWORD_LENGTH, friendlyAuthError, isValidEmail, passwordProblem } from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabase';

/** Password reset with a 6-digit emailed code — works the same on iPhone and web (no links to open). */
export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (authError) return setError(friendlyAuthError(authError));
    setStep('code');
  }

  async function resetPassword() {
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.');
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    setBusy(true);
    setError(null);
    const verified = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (verified.error) {
      setBusy(false);
      return setError(friendlyAuthError(verified.error));
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(friendlyAuthError(updateError));
    closeModal();
  }

  return (
    <Screen
      title="Reset password"
      subtitle={step === 'email' ? "We'll email you a 6-digit code." : `Code sent to ${email.trim()}.`}
      modal topAction={<CloseButton />}>
      <View style={styles.form}>
        {step === 'email' ? (
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onSubmitEditing={sendCode}
          />
        ) : (
          <>
            <TextField
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
            />
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              onSubmitEditing={resetPassword}
            />
          </>
        )}
        {error ? (
          <ThemedText themeColor="danger" role="alert">
            {error}
          </ThemedText>
        ) : null}
        {step === 'email' ? (
          <Button label="Send code" onPress={sendCode} loading={busy} />
        ) : (
          <>
            <Button label="Set new password" onPress={resetPassword} loading={busy} />
            <Button label="Send a new code" variant="ghost" onPress={sendCode} disabled={busy} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: Spacing.three } });
