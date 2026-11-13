import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { ApiError, GENDERS, api, type Center, type User } from './api';
import { AddButton, Badge, Button, Check, Chip, ErrorText, Field, FormModal, ManagementHeader, ManagementSearch, RowActions, confirmAction, useManagementTheme } from './managementUi';

const ROLES = ['all', 'admin', 'editor', 'viewer'] as const;

export function UsersScreen({ users, centers, me, reload }: { users: User[]; centers: Center[]; me: User; reload: () => Promise<void> }) {
  const { managementStyles } = useManagementTheme();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('all');
  const [centerFilter, setCenterFilter] = useState<number | null>(null);
  const [error, setError] = useState('');
  const isAdmin = me.is_admin;
  const manageableCenters = useMemo(
    () => isAdmin ? centers : centers.filter((center) => me.editor_for.includes(center.id)),
    [centers, isAdmin, me.editor_for],
  );
  const centersById = useMemo(() => new Map(centers.map((c) => [c.id, c])), [centers]);

  const shown = users.filter((u) =>
    `${u.name} ${u.email ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
    && (role === 'all' || u.role === role)
    && (centerFilter === null || u.associated_centers.includes(centerFilter)));

  async function remove(user: User) {
    if (!(await confirmAction(`Delete ${user.name} (${user.email || 'no email address'})?`))) return;
    setError('');
    try {
      await api.deleteUser(user.id);
      await reload();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Delete failed'); }
  }

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS !== 'web' ? (
        <ManagementHeader title="Users" description={`${shown.length === users.length ? users.length : `${shown.length}/${users.length}`} users · manage access and centers`}
          addLabel="Add user" onAdd={() => setEditing('new')} />
      ) : (
        <View style={{ width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <AddButton label="Add user" onPress={() => setEditing('new')} />
        </View>
      )}
      <FlatList
        data={shown}
        keyExtractor={(user) => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 28 }}
        ListHeaderComponent={(
          <View style={managementStyles.content}>
            <ManagementSearch label="Search users" value={search} onChangeText={setSearch} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginBottom: 4 }}>
              {ROLES.map((r) => <Chip key={r} label={r === 'all' ? 'All roles' : r} selected={role === r} onPress={() => setRole(r)} />)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              <Chip label="All centers" selected={centerFilter === null} onPress={() => setCenterFilter(null)} />
              {centers.map((c) => <Chip key={c.id} label={c.name} selected={centerFilter === c.id} onPress={() => setCenterFilter(centerFilter === c.id ? null : c.id)} />)}
            </View>
            <ErrorText message={error} />
          </View>
        )}
        renderItem={({ item: user }) => (
        <View style={managementStyles.content}><View style={managementStyles.row}>
          <View style={managementStyles.rowCopy}>
            <Text numberOfLines={1} style={managementStyles.rowName}>{user.name}{user.id === me.id ? ' (you)' : ''}</Text>
            <Text numberOfLines={1} style={managementStyles.rowMeta}>{user.email || 'No email'} · {user.role}</Text>
            {user.associated_centers.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {user.associated_centers.map((id) => {
                const c = centersById.get(id);
                return c ? <Badge key={id} label={user.editor_for.includes(id) ? `${c.name} ✎` : c.name} color={c.badge_text_color} /> : null;
              })}
            </View>}
          </View>
          {canEditUser(user, me) && <RowActions name={user.name} onEdit={() => setEditing(user)} onDelete={() => void remove(user)} />}
        </View></View>
        )}
        ListEmptyComponent={<Text style={managementStyles.empty}>No users match.</Text>}
      />
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          centers={manageableCenters}
          me={me}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </View>
  );
}

export function canEditUser(user: User, me: User): boolean {
  return me.is_admin || (
    !user.is_admin &&
    user.associated_centers.length > 0 &&
    user.associated_centers.every((centerId) => me.editor_for.includes(centerId))
  );
}

export function validateUserInput(input: {
  name: string;
  email: string;
  isAdmin: boolean;
  member: Set<number>;
  editor: Set<number>;
}): string {
  const name = input.name.trim();
  const email = input.email.trim();
  const pair = name.includes('&');
  if (!name) return 'Enter a name.';
  if (pair) {
    const names = name.split('&').map((part) => part.trim());
    if (names.length !== 2 || names.some((part) => !part)) return 'A pair name must contain exactly two nonempty names separated by &.';
    if (email) return 'Pairs cannot have an email address.';
    if (input.isAdmin || input.editor.size > 0) return 'Pairs cannot be administrators or editors.';
    if (input.member.size === 0) return 'Select at least one center.';
    return '';
  }
  if ((input.isAdmin || input.editor.size > 0) && !email) return 'Administrators and editors must have an email address.';
  if (!input.isAdmin && input.member.size === 0) return 'Select at least one center.';
  return '';
}

function UserForm({ user, centers, me, onClose, onSaved }: {
  user: User | null;
  centers: Center[];
  me: User;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors, managementStyles } = useManagementTheme();
  const [email, setEmail] = useState(user?.email ?? '');
  const [revokeSessions, setRevokeSessions] = useState(true);
  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<string | null>(user?.gender ?? null);
  const [isAdmin, setIsAdmin] = useState(user?.is_admin ?? false);
  const [member, setMember] = useState<Set<number>>(new Set(user?.associated_centers ?? []));
  const [editor, setEditor] = useState<Set<number>>(new Set(user?.editor_for ?? []));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailChanged = !!user && email.trim() !== (user.email ?? '');

  function setMembership(id: number, on: boolean) {
    const m = new Set(member);
    const e = new Set(editor);
    if (on) m.add(id); else { m.delete(id); e.delete(id); }
    setMember(m);
    setEditor(e);
  }
  function setEditing(id: number, on: boolean) {
    const m = new Set(member);
    const e = new Set(editor);
    if (on) { e.add(id); m.add(id); if (isAdmin) setIsAdmin(false); } else e.delete(id);
    setMember(m);
    setEditor(e);
  }
  async function save() {
    const validationError = validateUserInput({ name, email, isAdmin, member, editor });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!me.is_admin && isAdmin) {
      setError('Editors cannot assign administrator access.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.saveUser(user?.id ?? null, {
        email: email.trim() || null,
        ...(user ? { revoke_sessions: emailChanged && revokeSessions } : {}),
        name: name.trim(), gender, is_admin: isAdmin, associated_centers: [...member], editor_for: [...editor],
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <FormModal title={user ? 'Edit user' : 'Add user'} onClose={onClose}>
      <Field management label="Email (required for admins/editors; pairs cannot have one)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {emailChanged && (
        <Check label="Revoke existing sessions after changing email" value={revokeSessions} onChange={setRevokeSessions} />
      )}
      <Field management label="Name" value={name} onChangeText={setName} maxLength={200} />
      <Text style={managementStyles.formLabel}>GENDER</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        <Chip label="Not set" selected={gender === null} onPress={() => setGender(null)} />
        {GENDERS.map((g) => <Chip key={g} label={g} selected={gender === g} onPress={() => setGender(g)} />)}
      </View>
      {me.is_admin && <Check label="Administrator (full access)" value={isAdmin} onChange={(on) => {
        setIsAdmin(on);
        if (on) setEditor(new Set());
      }} />}
      <Text style={managementStyles.formLabel}>CENTERS</Text>
      {centers.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <View style={{ minWidth: 140 }}><Badge label={c.name} color={c.badge_text_color} /></View>
          <Check label="Member" value={member.has(c.id)} onChange={(on) => setMembership(c.id, on)} />
          <Check label="Editor" value={editor.has(c.id)} onChange={(on) => setEditing(c.id, on)} />
        </View>
      ))}
      {centers.length === 0 && <Text style={{ color: colors.muted }}>No centers yet.</Text>}
      <ErrorText message={error} />
      <View style={{ gap: 8, marginTop: 12 }}>
        <Button title={user ? 'Save changes' : 'Add user'} onPress={save} disabled={busy || !name.trim()} />
        <Button title="Cancel" kind="secondary" onPress={onClose} />
      </View>
    </FormModal>
  );
}
