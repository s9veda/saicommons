import React, { useState } from 'react';
import { CircleUserRound, LogIn } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ApiError, api, setToken, type User } from './api';
import { Button, ErrorText, Field, colors } from './ui';

export function LoginScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await action(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); } finally { setBusy(false); }
  }

  const sendCode = () => run(async () => {
    await api.login(email.trim());
    setSent(true);
  });
  const verify = () => run(async () => {
    const result = await api.verify(email.trim(), code.trim());
    if (!result.user.is_admin) throw new ApiError('This account is not an administrator.', 403, {});
    await setToken(result.token);
    onSignedIn(result.user);
  });

  return (
    <View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginBottom: 14 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <CircleUserRound color={colors.primary} size={26} />
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Signed out</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>
          Sign in with an administrator account to manage centers and users.
        </Text>
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <LogIn color={colors.primary} size={18} />
          <Text accessibilityRole="header" style={{ fontWeight: '700', color: colors.text, fontSize: 15 }}>{sent ? 'Verify your code' : 'Sign in'}</Text>
        </View>
        <Field label="Email" value={email} onChangeText={setEmail} editable={!sent} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        {sent ? (
          <>
            <Text style={{ color: colors.muted, marginBottom: 12, lineHeight: 19 }}>If this email belongs to a registered account, a 6-digit code was sent.</Text>
            <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" onSubmitEditing={verify} />
            <Button title={busy ? 'Verifying...' : 'Verify code'} onPress={verify} disabled={busy || code.trim().length !== 6} />
            <View style={{ height: 8 }} />
            <Button title="Use a different email" kind="secondary" onPress={() => { setSent(false); setCode(''); setError(''); }} disabled={busy} />
          </>
        ) : (
          <Button title={busy ? 'Sending...' : 'Send sign-in code'} onPress={sendCode} disabled={busy || !email.includes('@')} />
        )}
        <ErrorText message={error} />
      </View>
    </View>
  );
}
