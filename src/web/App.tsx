import { StatusBar } from 'expo-status-bar';
import { Building2, UsersRound } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api, loadToken, setToken, type Center, type User } from './src/api';
import { CentersScreen } from './src/CentersScreen';
import { ProfileButton, ProfileDrawer } from './src/ProfileDrawer';
import { UsersScreen } from './src/UsersScreen';
import { Button, ErrorText, colors } from './src/ui';

type Tab = 'centers' | 'users';

export default function App() {
  return <SafeAreaProvider><AdminApp /></SafeAreaProvider>;
}

function AdminApp() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [centers, setCenters] = useState<Center[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<Tab>('centers');
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    setMe(null);
    setCenters([]);
    setUsers([]);
    setError('');
    setProfileOpen(true);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([api.centers(), api.users()]);
      setCenters(c);
      setUsers(u);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        try { await signOut(); } catch { setError('Could not clear the saved session.'); }
      }
      else setError(e instanceof ApiError ? e.message : 'Failed to load data');
    }
  }, [signOut]);

  const restore = useCallback(async () => {
    setBooting(true);
    setRestoreError('');
    try {
      if (await loadToken()) {
        try {
          const { user } = await api.session();
          if (user.is_admin) setMe(user); else await signOut();
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

  useEffect(() => { if (me) void reload(); }, [me, reload]);

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
      <View style={{ flex: 1, width: '100%' }}>
        {Platform.OS === 'web' && <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16 }}><TabNavigation tab={tab} onSelect={setTab} placement="top" /></View>}
        {error ? <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 20 }}><ErrorText message={error} /></View> : null}
        {tab === 'centers'
          ? <CentersScreen centers={centers} users={users} reload={reload} />
          : <UsersScreen users={users} centers={centers} me={me} reload={reload} />}
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
      {me && !booting && !restoreError ? content : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom }}>
          {content}
        </ScrollView>
      )}
      {Platform.OS !== 'web' && me && !booting && !restoreError && !keyboardVisible && (
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom }}>
          <TabNavigation tab={tab} onSelect={setTab} placement="bottom" />
        </View>
      )}
      {!booting && !restoreError && (
        <ProfileDrawer visible={profileOpen} user={me} onClose={() => setProfileOpen(false)}
          onSignedIn={(user) => { setMe(user); setProfileOpen(false); }} onSignOut={signOut} />
      )}
    </View>
  );
}

function TabNavigation({ tab, onSelect, placement }: { tab: Tab; onSelect: (tab: Tab) => void; placement: 'top' | 'bottom' }) {
  const bottom = placement === 'bottom';
  return (
    <View accessibilityRole="tablist" style={bottom
      ? { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 0 }
      : { flexDirection: 'row', padding: 4, backgroundColor: colors.primaryLight, borderRadius: 14, marginBottom: 0 }}>
      {(['centers', 'users'] as const).map((item) => (
        <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => onSelect(item)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: bottom ? 50 : 40, borderRadius: 10,
            backgroundColor: !bottom && tab === item ? colors.surface : 'transparent' }}>
          {bottom && (item === 'centers'
            ? <Building2 color={tab === item ? colors.primary : colors.muted} size={22} strokeWidth={1.8} />
            : <UsersRound color={tab === item ? colors.primary : colors.muted} size={22} strokeWidth={1.8} />)}
          <Text style={{ color: tab === item ? colors.primary : colors.muted, fontWeight: '700', fontSize: bottom ? 12 : 14 }}>
            {item === 'centers' ? 'Centers' : 'Users'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
