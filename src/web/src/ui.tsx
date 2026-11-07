import React from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react-native';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from './theme';

export const colors = {
  primary: theme.forest, primaryLight: theme.sage, border: theme.line, muted: theme.muted,
  text: theme.ink, danger: theme.error, dangerLight: theme.saffronLight, ok: theme.forest,
  bg: theme.paper, surface: theme.surface, accent: theme.saffron, white: theme.white,
};

export function Button({ title, onPress, kind = 'primary', disabled }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.button, kind === 'primary' && styles.buttonPrimary, kind === 'danger' && styles.buttonDanger, pressed && { opacity: 0.75 }, disabled && { opacity: 0.5 }]}
    >
      <Text style={[styles.buttonText, kind === 'secondary' && { color: colors.primary }, kind === 'danger' && { color: colors.danger }]}>{title}</Text>
    </Pressable>
  );
}

export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.75 }]}>
      <Plus color={colors.white} size={18} />
    </Pressable>
  );
}

export function Field({ label, management = false, ...input }: { label: string; management?: boolean } & TextInputProps) {
  return (
    <View style={{ marginBottom: management ? 0 : 12 }}>
      {label ? <Text style={management ? styles.formLabel : styles.label}>{management ? label.toUpperCase() : label}</Text> : null}
      <TextInput {...input} accessibilityLabel={input.accessibilityLabel ?? (label || undefined)} style={[styles.input, management && styles.formInput, input.editable === false && { backgroundColor: colors.bg }]} placeholderTextColor={colors.muted} />
    </View>
  );
}

export function ManagementHeader({ title, description, addLabel, onAdd }: { title: string; description: string; addLabel: string; onAdd: () => void }) {
  return (
    <View style={styles.managementHeader}>
      <View style={styles.managementHeaderInner}>
        <View style={{ width: 44 }} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={styles.managementHeading}>{title}</Text>
          <Text style={styles.managementIntro}>{description}</Text>
        </View>
        <AddButton label={addLabel} onPress={onAdd} />
      </View>
    </View>
  );
}

export function ManagementSearch({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.searchWrap}>
      <Search color={colors.muted} size={18} strokeWidth={1.8} />
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={label}
        placeholderTextColor={colors.muted} autoCapitalize="none" returnKeyType="search" style={styles.searchInput} />
    </View>
  );
}

export const managementStyles = StyleSheet.create({
  content: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 16 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: colors.border },
  rowCopy: { flex: 1, minWidth: 0, paddingVertical: 8 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', padding: 28 },
  formLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
});

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={{ color: selected ? colors.primary : colors.muted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Check({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      style={[styles.check, disabled && { opacity: 0.5 }]}
    >
      <View style={[styles.box, value && styles.boxChecked]}>{value ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={{ flexShrink: 1, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string }) {
  return message ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginVertical: 8 }}>{message}</Text> : null;
}

export function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={styles.rowActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${name}`} onPress={onEdit} style={styles.rowAction}>
        <Pencil color={colors.primary} size={16} />
        <Text style={styles.rowActionText}>Edit</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${name}`} onPress={onDelete} style={styles.rowAction}>
        <Trash2 color={theme.rose} size={17} />
        <Text style={[styles.rowActionText, { color: theme.rose }]}>Delete</Text>
      </Pressable>
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return <Text style={[styles.badge, { color, borderColor: color, backgroundColor: `${color}20` }]}>{label}</Text>;
}

export function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close form" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text accessibilityRole="header" style={styles.dialogTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Alert.alert has no button support on web, so use window.confirm there. */
export function confirmAction(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => Alert.alert('Confirm', message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'OK', onPress: () => resolve(true) },
  ]));
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonDanger: { backgroundColor: colors.dangerLight },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  addButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#426756', alignItems: 'center', justifyContent: 'center' },
  managementHeader: { backgroundColor: colors.primary },
  managementHeaderInner: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingLeft: 12, paddingRight: 16, paddingTop: 2, paddingBottom: 23, flexDirection: 'row', alignItems: 'center' },
  managementHeading: { color: '#E6C08B', fontSize: 25, lineHeight: 30, fontWeight: '700', textAlign: 'center', marginTop: -8 },
  managementIntro: { color: '#C3D2C8', fontSize: 12, lineHeight: 16, marginTop: 3, textAlign: 'center' },
  searchWrap: { minHeight: 44, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 7, marginTop: -10, marginBottom: 4, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, minHeight: 42, color: colors.text, fontSize: 13, marginLeft: 8, paddingVertical: 0 },
  label: { fontWeight: '600', marginBottom: 6, color: colors.text, fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
  formLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  formInput: { minHeight: 46, borderRadius: 7, paddingHorizontal: 12, fontSize: 14 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginRight: 6, marginBottom: 6 },
  chipSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  check: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 5 },
  box: { width: 22, height: 22, borderWidth: 1, borderColor: colors.muted, borderRadius: 6, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary },
  tick: { color: colors.white, fontSize: 14, lineHeight: 16 },
  badge: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start', overflow: 'hidden', fontSize: 12, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(16,29,23,0.48)', alignItems: 'center', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', padding: Platform.OS === 'web' ? 16 : 0 },
  dialog: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 26, width: '100%', maxWidth: 560, maxHeight: '88%' },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dialogTitle: { fontSize: 21, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', color: colors.text },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, lineHeight: 27, color: colors.muted },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  rowAction: { width: 40, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  rowActionText: { color: colors.primary, fontSize: 8, lineHeight: 10, fontWeight: '600' },
});
