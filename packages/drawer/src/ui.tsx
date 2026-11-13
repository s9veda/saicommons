import React from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react-native';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { DrawerTheme } from './theme';

/** Create styles using the provided theme */
export function createStyles(theme: DrawerTheme) {
  return StyleSheet.create({
    button: {
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPrimary: { backgroundColor: theme.primary },
    buttonDanger: { backgroundColor: theme.dangerLight },
    buttonText: { color: theme.white, fontWeight: '700', fontSize: 14 },
    addButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#426756', alignItems: 'center', justifyContent: 'center' },
    managementHeader: { backgroundColor: theme.primary },
    managementHeaderInner: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingLeft: 12, paddingRight: 16, paddingTop: 12, paddingBottom: 23, flexDirection: 'row', alignItems: 'center' },
    managementHeading: { color: '#E6C08B', fontSize: 25, lineHeight: 30, fontWeight: '700', textAlign: 'center' },
    managementIntro: { color: '#C3D2C8', fontSize: 12, lineHeight: 16, marginTop: 3, textAlign: 'center' },
    searchWrap: { minHeight: 44, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 7, marginTop: -10, marginBottom: 4, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' },
    searchInput: { flex: 1, minHeight: 42, color: theme.text, fontSize: 13, marginLeft: 8, paddingVertical: 0 },
    label: { fontWeight: '600', marginBottom: 6, color: theme.text, fontSize: 13 },
    input: { minHeight: 48, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.surface, color: theme.text, fontSize: 16 },
    formLabel: { color: theme.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
    formInput: { minHeight: 46, borderRadius: 7, paddingHorizontal: 12, fontSize: 14 },
    chip: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginRight: 6, marginBottom: 6 },
    chipSelected: { backgroundColor: theme.primaryLight, borderColor: theme.primaryLight },
    check: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 5 },
    box: { width: 22, height: 22, borderWidth: 1, borderColor: theme.muted, borderRadius: 6, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
    boxChecked: { backgroundColor: theme.primary },
    tick: { color: theme.white, fontSize: 14, lineHeight: 16 },
    badge: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start', overflow: 'hidden', fontSize: 12, fontWeight: '600' },
    overlay: { flex: 1, backgroundColor: 'rgba(16,29,23,0.48)', alignItems: 'center', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', padding: Platform.OS === 'web' ? 16 : 0 },
    dialog: { backgroundColor: theme.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 26, width: '100%', maxWidth: 560, maxHeight: '88%' },
    dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    dialogTitle: { fontSize: 21, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', color: theme.text },
    closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontSize: 24, lineHeight: 27, color: theme.muted },
    rowActions: { flexDirection: 'row', alignItems: 'center' },
    rowAction: { width: 40, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
    rowActionText: { color: theme.primary, fontSize: 8, lineHeight: 10, fontWeight: '600' },
  });
}

/** Theme-aware colors object */
export function createColors(theme: DrawerTheme) {
  return {
    primary: theme.primary,
    primaryLight: theme.primaryLight,
    border: theme.border,
    muted: theme.muted,
    text: theme.text,
    danger: theme.danger,
    dangerLight: theme.dangerLight,
    ok: theme.ok,
    bg: theme.bg,
    surface: theme.surface,
    accent: theme.accent,
    white: theme.white,
  };
}