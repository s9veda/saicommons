import React from 'react';
import { Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { DrawerTheme } from './theme';
import { createStyles } from './ui';
import { useDrawerTheme } from './Context';

export interface AddButtonProps {
  label: string;
  onPress: () => void;
}

export function AddButton({ label, onPress }: AddButtonProps) {
  const theme = useDrawerTheme();
  const styles = createStyles(theme);
  
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.75 }]}>
      <Plus color={theme.white} size={18} />
    </Pressable>
  );
}