import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { BadgeCheck, Building2, CircleUserRound, LogOut, ShieldCheck, X } from 'lucide-react-native';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { User } from './api';
import { LoginScreen } from './LoginScreen';
import { colors } from './ui';

export function ProfileButton({ user, onPress }: { user: User | null; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={user ? 'Open profile' : 'Sign in or view profile'} onPress={onPress} style={styles.profileButton}>
      <CircleUserRound color={colors.white} size={21} strokeWidth={1.8} />
      {user && <View style={styles.onlineDot} />}
    </Pressable>
  );
}

export function ProfileDrawer({ visible, user, onClose, onSignedIn, onSignOut }: {
  visible: boolean;
  user: User | null;
  onClose: () => void;
  onSignedIn: (user: User) => void;
  onSignOut: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(390, width * 0.9);
  const progress = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [visible, progress]);

  function close() {
    if (busy) return;
    Animated.timing(progress, { toValue: 0, duration: 190, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished) onClose();
    });
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await onSignOut();
    } catch {
      setError('Could not clear the saved session. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={close}>
      <StatusBar style="dark" />
      <SafeAreaProvider style={{ flex: 1 }}>
        <View style={styles.root}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close profile drawer" onPress={close} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] }) }] }]}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>Your profile</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={close} disabled={busy} style={styles.close}>
                  <X color={colors.white} size={19} />
                </Pressable>
              </View>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
                  {user ? (
                    <>
                      <View style={styles.identity}>
                        <View style={styles.avatar}><Text style={styles.avatarText}>{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</Text></View>
                        <Text style={styles.name}>{user.name}</Text>
                        <Text style={styles.email}>{user.email}</Text>
                        <View style={styles.status}><BadgeCheck color={colors.primary} size={15} /><Text style={styles.statusText}>Signed in · Admin</Text></View>
                      </View>
                      <View style={styles.section}>
                        <View style={styles.sectionHeading}><ShieldCheck color={colors.primary} size={17} /><Text style={styles.sectionTitle}>Access</Text></View>
                        <View style={styles.statusLine}><Text style={styles.label}>Role</Text><Text style={styles.value}>Administrator</Text></View>
                      </View>
                      <View style={styles.section}>
                        <View style={styles.sectionHeading}><Building2 color={colors.primary} size={17} /><Text style={styles.sectionTitle}>Center access</Text></View>
                        <Text style={styles.label}>Management access</Text>
                        <Text style={[styles.value, { marginTop: 4 }]}>All centers</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void signOut()} style={styles.signOut}>
                        {busy ? <ActivityIndicator color={colors.danger} /> : <LogOut color={colors.danger} size={17} />}
                        <Text style={{ color: colors.danger, fontWeight: '600' }}>Sign out</Text>
                      </Pressable>
                      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 10 }}>{error}</Text> : null}
                    </>
                  ) : <LoginScreen onSignedIn={onSignedIn} />}
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Animated.View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  profileButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#426756', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', right: 1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#78B68E', borderWidth: 1.5, borderColor: colors.primary },
  root: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(16,29,23,0.42)' },
  drawer: { height: '100%', backgroundColor: colors.bg, shadowColor: '#000000', shadowOffset: { width: -6, height: 0 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 14 },
  header: { minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 22 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  identity: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', padding: 20 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  avatarText: { color: colors.primary, fontSize: 25 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  email: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
  status: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: 14, paddingHorizontal: 11, marginTop: 12 },
  statusText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 15, marginTop: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  statusLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  label: { color: colors.muted, fontSize: 12 },
  value: { color: colors.text, fontSize: 12, fontWeight: '600' },
  signOut: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 16 },
});
