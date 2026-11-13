import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowRight, BadgeCheck, Building2, LogOut, ShieldCheck, UsersRound, X } from 'lucide-react-native';
import type { User } from './types';
import { createColors } from './ui';

export function renderDefaultHeader(styles: any, colors: any, close: () => void, busy: boolean) {
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>Your profile</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={close} disabled={busy} style={styles.close}>
        <X color={colors.white} size={19} />
      </Pressable>
    </>
  );
}

export function renderStatusBadge(colors: any, styles: any, user: User) {
  if (user.is_admin) {
    return (
      <>
        <ShieldCheck color={colors.primary} size={12} />
        <Text style={styles.statusText}>Administrator</Text>
      </>
    );
  }
  if (user.editor_for.length > 0) {
    return (
      <>
        <BadgeCheck color={colors.primary} size={12} />
        <Text style={styles.statusText}>Editor</Text>
      </>
    );
  }
  return (
    <>
      <Building2 color={colors.primary} size={12} />
      <Text style={styles.statusText}>Member</Text>
    </>
  );
}

export function renderDefaultAccessSection(styles: any, colors: any, user: User) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <ShieldCheck color={colors.primary} size={16} />
        <Text style={styles.sectionTitle}>Access</Text>
      </View>
      <View style={styles.statusLine}>
        <Text style={styles.label}>Account status</Text>
        <Text style={styles.value}>Active</Text>
      </View>
      <View style={styles.statusLine}>
        <Text style={styles.label}>Admin</Text>
        <Text style={styles.value}>{user.is_admin ? 'Yes' : 'No'}</Text>
      </View>
    </View>
  );
}

export function renderCenterAccessSection(styles: any, colors: any, user: User, centerNames: Map<number, string>, loading: boolean, error: string, retry: () => void) {
  const names = (ids: number[]) => ids.length ? ids.map((id) => centerNames.get(id) ?? `Center ${id}`).join(', ') : 'None';
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Building2 color={colors.primary} size={16} />
        <Text style={styles.sectionTitle}>Center access</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : (
        <>
          {error ? (
            <View>
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={retry}><Text style={{ color: colors.primary }}>Retry</Text></Pressable>
            </View>
          ) : null}
          <Text style={styles.label}>Editor for</Text>
          <Text style={styles.accessValue}>{user.is_admin ? 'All centers' : names(user.editor_for)}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Associated centers</Text>
          <Text style={styles.accessValue}>{user.is_admin ? 'All centers' : names(user.associated_centers)}</Text>
        </>
      )}
    </View>
  );
}

export function renderManagementButton(styles: any, colors: any, section: 'centers' | 'users', onPress: () => void) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.managementButton}>
      {section === 'centers' ? <Building2 color={colors.primary} size={17} /> : <UsersRound color={colors.primary} size={17} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{section === 'centers' ? 'Manage centers' : 'Manage users'}</Text>
        <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>
          {section === 'centers' ? 'Centers and editor access' : 'Users, roles and center access'}
        </Text>
      </View>
      <ArrowRight color={colors.muted} size={16} />
    </Pressable>
  );
}

export function renderSignOutButton(styles: any, colors: any, signOut: () => void, busy: boolean) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void signOut()} style={styles.signOut}>
      {busy ? <ActivityIndicator color={colors.danger} /> : <LogOut color={colors.danger} size={17} />}
      <Text style={{ color: colors.danger, fontWeight: '600' }}>Sign out</Text>
    </Pressable>
  );
}

export function renderErrorText(styles: any, colors: any, error: string) {
  if (!error) return null;
  return <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 10 }}>{error}</Text>;
}

export function renderUserIdentity(styles: any, colors: any, user: User) {
  return (
    <View style={styles.identity}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{user.name}</Text>
      {user.email && <Text style={styles.email}>{user.email}</Text>}
      <View style={styles.status}>
        {renderStatusBadge(colors, styles, user)}
      </View>
    </View>
  );
}