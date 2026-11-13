import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { CircleUserRound, LogIn } from 'lucide-react-native';
import type { User, LoginScreenProps, AuthConfig } from './types';
import { login, verifyOtp, setToken, ApiError } from './api';
import { Button } from './Button';
import { ErrorText } from './ErrorText';
import { Field } from './Field';
import { DrawerThemeProvider, useDrawerTheme } from './Context';
import { createTheme, type DrawerTheme } from './theme';

export function LoginScreen({ onSignedIn, theme: themeOverride, authConfig, signedOutDescription }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const inheritedTheme = useDrawerTheme();
  const theme = themeOverride ? createTheme({ ...inheritedTheme, ...themeOverride }) : inheritedTheme;

  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await action(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); } finally { setBusy(false); }
  }

  const sendCode = () => run(async () => {
    await login(email.trim(), authConfig);
    setSent(true);
  });

  const verify = () => run(async () => {
    const result = await verifyOtp(email.trim(), code.trim(), authConfig);
    if (authConfig?.checkPermissions && !(await authConfig.checkPermissions(result.user))) {
      throw new ApiError(authConfig.permissionErrorMessage ?? 'This account does not have the required permissions.', 403, {});
    }
    await setToken(result.token);
    onSignedIn(result.user);
  });

  return (
    <DrawerThemeProvider theme={theme}>
      <View>
        <View style={{ backgroundColor: theme.surface, borderRadius: 8, padding: 20, borderWidth: 1, borderColor: theme.border, alignItems: 'center', marginBottom: 14 }}>
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <CircleUserRound color={theme.primary} size={26} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>Signed out</Text>
          {signedOutDescription ? (
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>
              {signedOutDescription}
            </Text>
          ) : null}
        </View>
        <View style={{ backgroundColor: theme.surface, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <LogIn color={theme.primary} size={18} />
            <Text accessibilityRole="header" style={{ fontWeight: '700', color: theme.text, fontSize: 15 }}>{sent ? 'Verify your code' : 'Sign in'}</Text>
          </View>
          <Field label="Email" value={email} onChangeText={setEmail} editable={!sent} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {sent ? (
            <>
              <Text style={{ color: theme.muted, marginBottom: 12, lineHeight: 19 }}>If this email belongs to a registered account, a 6-digit code was sent.</Text>
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
    </DrawerThemeProvider>
  );
}