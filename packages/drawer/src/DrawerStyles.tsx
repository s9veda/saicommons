import { Platform, StyleSheet } from 'react-native';
import type { DrawerTheme } from './theme';
import { createColors } from './ui';

export function getDrawerStyles(theme: DrawerTheme) {
  const colors = createColors(theme);
  return StyleSheet.create({
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
    accessValue: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 4 },
    managementButton: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
    signOut: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 16 },
  });
}