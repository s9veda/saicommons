import React from 'react';
import { Pressable, Text } from 'react-native';
import type { DrawerTheme } from './theme';
import { createStyles, createColors } from './ui';
import { useDrawerTheme } from './Context';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: any;
}

export function Button({ title, onPress, kind = 'primary', disabled, style }: ButtonProps) {
  const theme = useDrawerTheme();
  const colors = createColors(theme);
  const styles = createStyles(theme);
  
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && styles.buttonPrimary,
        kind === 'danger' && styles.buttonDanger,
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.5 },
        style
      ]}
    >
      <Text style={[
        styles.buttonText,
        kind === 'secondary' && { color: colors.primary },
        kind === 'danger' && { color: colors.danger }
      ]}>
        {title}
      </Text>
    </Pressable>
  );
}