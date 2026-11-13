import React from 'react';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDrawerTheme } from './Context';
import { createStyles } from './ui';

export { Button } from './Button';
export { AddButton } from './AddButton';
export { Field } from './Field';
export { ErrorText } from './ErrorText';
export { ManagementHeader } from './ManagementHeader';
export { ManagementSearch } from './ManagementSearch';
export function useManagementTheme() {
  const colors = useDrawerTheme();
  const managementStyles = StyleSheet.create({
  content: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 16 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: colors.border },
  rowCopy: { flex: 1, minWidth: 0, paddingVertical: 8 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', padding: 28 },
  formLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  });
  return { colors, managementStyles };
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useDrawerTheme();
  const styles = createStyles(colors);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={{ color: selected ? colors.primary : colors.muted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Check({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const colors = useDrawerTheme();
  const styles = createStyles(colors);
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

export function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  const colors = useDrawerTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.rowActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${name}`} onPress={onEdit} style={styles.rowAction}>
        <Pencil color={colors.primary} size={16} />
        <Text style={styles.rowActionText}>Edit</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${name}`} onPress={onDelete} style={styles.rowAction}>
        <Trash2 color={colors.danger} size={17} />
        <Text style={[styles.rowActionText, { color: colors.danger }]}>Delete</Text>
      </Pressable>
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  const styles = createStyles(useDrawerTheme());
  return <Text style={[styles.badge, { color, borderColor: color, backgroundColor: `${color}20` }]}>{label}</Text>;
}

export function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const styles = createStyles(useDrawerTheme());
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

