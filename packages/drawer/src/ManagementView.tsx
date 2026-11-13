import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { api, ApiError, type Center } from './api';
import type { User } from './types';
import { CentersScreen } from './CentersScreen';
import { UsersScreen } from './UsersScreen';
import { useDrawerTheme } from './Context';

export function canManageManagementSection(section: 'centers' | 'users', user: User): boolean {
  return section === 'centers' ? user.is_admin : user.is_admin || user.editor_for.length > 0;
}

export function ManagementView({ section, user, onBack, onChanged }: {
  section: 'centers' | 'users';
  user: User;
  onBack: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const theme = useDrawerTheme();
  const [centers, setCenters] = useState<Center[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canManageSection = canManageManagementSection(section, user);

  const reload = useCallback(async () => {
    try {
      const [nextCenters, nextUsers] = await Promise.all([api.centers(), api.users()]);
      setCenters(nextCenters);
      setUsers(nextUsers);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load management data.');
      throw e;
    }
  }, []);

  useEffect(() => {
    if (!canManageSection) return;
    let active = true;
    void reload().catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, canManageSection]);

  const reloadAfterChange = useCallback(async () => {
    await onChanged?.();
    await reload();
  }, [reload, onChanged]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={onBack} hitSlop={8}>
          <ArrowLeft color={theme.text} size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
          {section === 'centers' ? 'Manage centers' : 'Manage users'}
        </Text>
      </View>
      {!canManageSection ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger, padding: 16 }}>You do not have permission to manage this section.</Text>
      ) : error ? <Text accessibilityRole="alert" style={{ color: theme.danger, padding: 16 }}>{error}</Text> : null}
      {canManageSection && (loading ? <ActivityIndicator style={{ marginTop: 32 }} /> : error && centers.length === 0 && users.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void reload().catch(() => {}).finally(() => setLoading(false)); }} style={{ padding: 16 }}>
          <Text style={{ color: theme.primary }}>Retry</Text>
        </Pressable>
      ) : section === 'centers' ? (
        <CentersScreen centers={centers} users={users} reload={reloadAfterChange} />
      ) : (
        <UsersScreen users={users} centers={centers} me={user} reload={reloadAfterChange} />
      ))}
    </View>
  );
}
