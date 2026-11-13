import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import type { User, ProfileDrawerProps } from './types';
import { LoginScreen } from './LoginScreen';
import { createColors } from './ui';
import { DrawerThemeProvider, useDrawerTheme } from './Context';
import { createTheme } from './theme';
import { getDrawerStyles } from './DrawerStyles';
import { api, ApiError, type Center } from './api';
import { ManagementView } from './ManagementView';
import { renderDefaultHeader, renderUserIdentity, renderDefaultAccessSection, renderCenterAccessSection, renderManagementButton, renderSignOutButton, renderErrorText } from './DrawerRender';

export function ProfileDrawer({ 
  visible, 
  user, 
  onClose, 
  onSignedIn, 
  onSignOut, 
  theme: themeOverride,
  authConfig,
  enableManagement = false,
  onManagementChanged,
  headerContent,
  signedInContent,
  signedOutDescription,
  signedOutContent,
}: ProfileDrawerProps) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(390, width * 0.9);
  const progress = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [management, setManagement] = useState<'centers' | 'users' | null>(null);
  const [centerState, setCenterState] = useState<{ userId: string; centers: Center[]; loading: boolean; error: string } | null>(null);
  const [centersRevision, setCentersRevision] = useState(0);
  const hasCustomContent = !!signedInContent;

  const inheritedTheme = useDrawerTheme();
  const theme = themeOverride ? createTheme({ ...inheritedTheme, ...themeOverride }) : inheritedTheme;

  useEffect(() => {
    if (!visible) setManagement(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || !user || hasCustomContent || user.is_admin || (!user.editor_for.length && !user.associated_centers.length)) return;
    let active = true;
    setCenterState({ userId: user.id, centers: [], loading: true, error: '' });
    void api.centers().then((result) => {
      if (active) setCenterState({ userId: user.id, centers: result, loading: false, error: '' });
    }).catch((e: unknown) => {
      if (active) setCenterState({ userId: user.id, centers: [], loading: false, error: e instanceof ApiError ? e.message : 'Failed to load centers.' });
    });
    return () => { active = false; };
  }, [visible, user, hasCustomContent, centersRevision]);

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

  const colors = createColors(theme);
  const styles = getDrawerStyles(theme);
  const canManageUsers = !!user && (user.is_admin || user.editor_for.length > 0);
  const canManageCenters = !!user?.is_admin;
  const needsCenters = !!user && !user.is_admin && (user.editor_for.length > 0 || user.associated_centers.length > 0);
  const currentCenters = needsCenters && centerState?.userId === user?.id ? centerState : null;

  return (
    <DrawerThemeProvider theme={theme}>
      <Modal visible={visible} transparent animationType="none" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={management ? () => setManagement(null) : close}>
        <StatusBar style="dark" />
        <SafeAreaProvider style={{ flex: 1 }}>
          {management && user && enableManagement && (management === 'centers' ? canManageCenters : canManageUsers) ? (
            <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={{ flex: 1, backgroundColor: theme.bg }}>
              <ManagementView section={management} user={user} onBack={() => setManagement(null)} onChanged={onManagementChanged} />
            </SafeAreaView>
          ) : (
          <View style={styles.root}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close profile drawer" onPress={close} style={StyleSheet.absoluteFill} />
            <Animated.View style={[
              styles.drawer,
              { width: drawerWidth, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] }) }] }
            ]}>
              <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={{ flex: 1 }}>
                <View style={styles.header}>
                  {headerContent ? headerContent : renderDefaultHeader(styles, colors, close, busy)}
                </View>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
                    {user ? (
                      <>
                        {renderUserIdentity(styles, colors, user)}
                        {signedInContent ? signedInContent : (
                          <>
                            {renderDefaultAccessSection(styles, colors, user)}
                            {renderCenterAccessSection(styles, colors, user, new Map((currentCenters?.centers ?? []).map((center) => [center.id, center.name])), needsCenters && (currentCenters?.loading ?? true), currentCenters?.error ?? '', () => setCentersRevision((value) => value + 1))}
                          </>
                        )}
                        {enableManagement && canManageCenters && (
                          renderManagementButton(styles, colors, 'centers', () => setManagement('centers'))
                        )}
                        {enableManagement && canManageUsers && (
                          <>
                            {renderManagementButton(styles, colors, 'users', () => setManagement('users'))}
                          </>
                        )}
                        {renderSignOutButton(styles, colors, signOut, busy)}
                        {renderErrorText(styles, colors, error)}
                      </>
                    ) : signedOutContent ? (
                      signedOutContent
                    ) : (
                      <LoginScreen onSignedIn={onSignedIn} authConfig={authConfig} signedOutDescription={signedOutDescription} />
                    )}
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </Animated.View>
          </View>
          )}
        </SafeAreaProvider>
      </Modal>
    </DrawerThemeProvider>
  );
}