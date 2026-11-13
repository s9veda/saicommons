import React from 'react';
import { View, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import type { DrawerTheme } from './theme';
import { createStyles } from './ui';
import { useDrawerTheme } from './Context';

export interface ManagementSearchProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}

export function ManagementSearch({ label, value, onChangeText }: ManagementSearchProps) {
  const theme = useDrawerTheme();
  const styles = createStyles(theme);
  
  return (
    <View style={styles.searchWrap}>
      <Search color={theme.muted} size={18} strokeWidth={1.8} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.searchInput}
      />
    </View>
  );
}