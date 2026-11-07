import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { ApiError, api, type Center, type User } from './api';
import { ColorPicker } from './ColorPicker';
import { usersWithEmail } from './userFilters';
import { Badge, Button, Check, ErrorText, Field, FormModal, ManagementHeader, ManagementSearch, RowActions, colors, confirmAction, managementStyles } from './ui';

const DEFAULT_COLOR = '#1e40af';
const PRESETS = [
  '#1e40af', '#047857', '#b91c1c', '#b45309', '#7c3aed', '#0f766e',
  '#2563eb', '#0369a1', '#0891b2', '#15803d', '#4d7c0f', '#a16207',
  '#c2410c', '#be123c', '#be185d', '#a21caf', '#475569', '#000000',
];

export function CentersScreen({ centers, users, reload }: { centers: Center[]; users: User[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Center | 'new' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const shown = centers.filter((center) => center.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function remove(center: Center) {
    if (!(await confirmAction(`Delete center "${center.name}"?`))) return;
    setError('');
    try {
      await api.deleteCenter(center.id);
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const items = ((e.data.dependencies as { items?: string[] } | undefined)?.items ?? []).join(', ');
        setError(`${e.message}: ${items}`);
      } else setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ManagementHeader title="Centers" description={`${shown.length === centers.length ? centers.length : `${shown.length}/${centers.length}`} centers · assign editors to manage each one`}
        addLabel="Add center" onAdd={() => setEditing('new')} />
      <View style={managementStyles.content}>
        <ManagementSearch label="Search centers" value={search} onChangeText={setSearch} />
        <ErrorText message={error} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(center) => String(center.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item: center }) => (
        <View style={managementStyles.content}><View style={managementStyles.row}>
          <View style={{ width: 7, height: 30, borderRadius: 4, backgroundColor: center.badge_text_color, marginRight: 4 }} />
          <View style={managementStyles.rowCopy}>
            <Text numberOfLines={1} style={managementStyles.rowName}>{center.name}</Text>
            <Text style={managementStyles.rowMeta}>
              {center.member_count} {center.member_count === 1 ? 'member' : 'members'} · {center.editor_ids.length} {center.editor_ids.length === 1 ? 'editor' : 'editors'}
            </Text>
            {center.editor_ids.length > 0 && <Text numberOfLines={2} style={managementStyles.rowMeta}>
              {center.editor_ids.map((id) => usersById.get(id)?.name ?? 'Unknown').join(', ')}
            </Text>}
          </View>
          <RowActions name={center.name} onEdit={() => setEditing(center)} onDelete={() => void remove(center)} />
        </View></View>
        )}
        ListEmptyComponent={<Text style={managementStyles.empty}>{centers.length === 0 ? 'No centers yet.' : 'No centers found.'}</Text>}
      />
      {editing && (
        <CenterForm
          center={editing === 'new' ? null : editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </View>
  );
}

function CenterForm({ center, users, onClose, onSaved }: { center: Center | null; users: User[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(center?.name ?? '');
  const [color, setColor] = useState(center?.badge_text_color ?? DEFAULT_COLOR);
  const [editorIds, setEditorIds] = useState<Set<string>>(new Set(center?.editor_ids ?? []));
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const validColor = /^#[0-9a-fA-F]{6}$/.test(color);
  const eligibleUsers = usersWithEmail(users);
  const shown = eligibleUsers.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const visibleEditorCount = eligibleUsers.filter((user) => editorIds.has(user.id)).length;
  const hiddenEditorCount = editorIds.size - visibleEditorCount;

  function toggle(id: string, on: boolean) {
    const next = new Set(editorIds);
    if (on) next.add(id); else next.delete(id);
    setEditorIds(next);
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.saveCenter(center?.id ?? null, { name, badge_text_color: color, editor_ids: [...editorIds] });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <FormModal title={center ? 'Edit center' : 'Add center'} onClose={onClose}>
      <Field management label="Center name" value={name} onChangeText={setName} maxLength={255} autoFocus />
      <Field management label="Badge text color" value={color} onChangeText={setColor} autoCapitalize="none" maxLength={7} />
      <ColorPicker value={color} onChange={setColor} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', maxWidth: 256, gap: 8, marginBottom: 12, alignItems: 'center' }}>
        {PRESETS.map((preset) => (
          <Pressable
            key={preset}
            accessibilityRole="button"
            accessibilityLabel={`Select color ${preset}`}
            accessibilityState={{ selected: color.toLowerCase() === preset }}
            onPress={() => setColor(preset)}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              borderWidth: color.toLowerCase() === preset ? 2 : 0, borderColor: colors.text }}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: preset }} />
          </Pressable>
        ))}
      </View>
      {validColor && <View style={{ marginBottom: 12 }}><Badge label={name || 'Preview'} color={color} /></View>}
      <Text style={managementStyles.formLabel}>CENTER EDITORS ({visibleEditorCount})</Text>
      {hiddenEditorCount > 0 && (
        <Text style={{ color: colors.muted, marginBottom: 8 }}>
          {hiddenEditorCount} existing editor{hiddenEditorCount === 1 ? '' : 's'} not shown; their assignments will be preserved.
        </Text>
      )}
      <Field label="" value={filter} onChangeText={setFilter} placeholder="Search users" autoCapitalize="none" />
      <ScrollView style={{ maxHeight: 220, marginBottom: 8 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {shown.map((u) => <Check key={u.id} label={`${u.name} (${u.email})`} value={editorIds.has(u.id)} onChange={(on) => toggle(u.id, on)} />)}
      </ScrollView>
      <ErrorText message={error} />
      <View style={{ gap: 8, marginTop: 12 }}>
        <Button title={center ? 'Save changes' : 'Add center'} onPress={save} disabled={busy || !name.trim() || !validColor} />
        <Button title="Cancel" kind="secondary" onPress={onClose} />
      </View>
    </FormModal>
  );
}
