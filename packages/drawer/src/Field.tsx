import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import type { DrawerTheme } from './theme';
import { createStyles, createColors } from './ui';
import { useDrawerTheme } from './Context';

export interface FieldProps extends TextInputProps {
  label: string;
  management?: boolean;
}

export function Field({ label, management = false, ...input }: FieldProps) {
  const theme = useDrawerTheme();
  const colors = createColors(theme);
  const styles = createStyles(theme);
  
  return (
    <View style={{ marginBottom: management ? 0 : 12 }}>
      {label ? <Text style={management ? styles.formLabel : styles.label}>{management ? label.toUpperCase() : label}</Text> : null}
      <TextInput
        {...input}
        accessibilityLabel={input.accessibilityLabel ?? (label || undefined)}
        style={[
          styles.input,
          management && styles.formInput,
          input.editable === false && { backgroundColor: colors.bg }
        ]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}