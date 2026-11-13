import { StatusBar } from 'expo-status-bar';
import { LucideProvider } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api, apiConfig, loadToken, setToken, type User } from './src/api';
import { Button, ErrorText, defaultTheme as colors, ProfileButton, ProfileDrawer, DrawerThemeProvider, configureApi, createTheme } from '@saicommons/drawer';

configureApi(apiConfig);

function hasManagementAccess(user: User): boolean {
  return user.is_admin || user.editor_for.length > 0;
}

const appTheme = createTheme({
  primary: colors.primary,
  primaryLight: colors.primaryLight,
  border: colors.border,
  muted: colors.muted,
  text: colors.text,
  danger: colors.danger,
  dangerLight: colors.dangerLight,
  ok: colors.ok,
  bg: colors.bg,
  surface: colors.surface,
  accent: colors.accent,
  white: colors.white,
});

export default function App() {
  return (
    <SafeAreaProvider>
      <LucideProvider>
        <DrawerThemeProvider theme={appTheme}>
          <AdminApp />
        </DrawerThemeProvider>
      </LucideProvider>
    </SafeAreaProvider>
  );
}

function AdminApp() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const signOut = useCallback(async () => {
    await setToken(null);
    setMe(null);
    setProfileOpen(true);
  }, []);

  const refreshAfterManagement = useCallback(async () => {
    try {
      const { user } = await api.getSession();
      if (hasManagementAccess(user)) setMe(user); else await signOut();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await signOut();
      else throw e;
    }
  }, [signOut]);

  const restore = useCallback(async () => {
    setBooting(true);
    setRestoreError('');
    try {
      if (await loadToken()) {
        try {
          const { user } = await api.getSession();
          if (hasManagementAccess(user)) setMe(user); else await signOut();
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) await signOut();
          else throw e;
        }
      } else setProfileOpen(true);
    } catch (e) {
      setRestoreError(e instanceof ApiError ? e.message : 'Could not restore the saved session.');
    } finally {
      setBooting(false);
    }
  }, [signOut]);

  useEffect(() => { void restore(); }, [restore]);

  let content: React.ReactNode;
  if (booting) {
    content = <ActivityIndicator style={{ marginTop: 80 }} />;
  } else if (restoreError) {
    content = <View style={{ padding: 24 }}><ErrorText message={restoreError} /><Button title="Retry" onPress={() => void restore()} /></View>;
  } else if (!me) {
    content = (
      <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24 }}>
        <Text style={{ color: colors.muted, marginBottom: 16 }}>Sign in to manage centers and users.</Text>
        <View style={{ alignSelf: 'flex-start' }}><Button title="Sign in" onPress={() => setProfileOpen(true)} /></View>
      </View>
    );
  } else {
    content = (
      <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24 }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center' }}>
          Welcome to the Admin app. You are signed in.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <View style={{ backgroundColor: colors.primary, paddingTop: insets.top }}>
        {!booting && !restoreError && (
          <View style={{ width: '100%', maxWidth: 960, minHeight: 48, alignSelf: 'center', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
              <Image accessibilityLabel="Sri Sathya Sai Baba" source={require('./assets/sai.webp')} resizeMode="cover"
                style={{ width: 38, height: 38, borderRadius: 19, marginRight: 8 }} />
              <Image accessibilityLabel="Sai values logo" source={require('./assets/sai-values-logo-transparent.png')} resizeMode="contain"
                style={{ width: 38, height: 38 }} />
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', left: 110, right: 110, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: colors.white, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Admin</Text>
            </View>
            <ProfileButton user={me} onPress={() => setProfileOpen(true)} />
          </View>
        )}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom }}>
        {content}
      </ScrollView>
      {!booting && !restoreError && (
        <ProfileDrawer visible={profileOpen} user={me} onClose={() => setProfileOpen(false)}
          onSignedIn={(user) => { setMe(user); setProfileOpen(false); }} onSignOut={signOut}
          enableManagement
          onManagementChanged={refreshAfterManagement}
          signedOutDescription="Sign in with an administrator or editor account to manage centers and users."
          authConfig={{ checkPermissions: hasManagementAccess, permissionErrorMessage: 'This account cannot manage centers or users.' }} />
      )}
    </View>
  );
}
