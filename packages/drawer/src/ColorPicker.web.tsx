import React from 'react';
import { Text, View } from 'react-native';
import { hexToRgb } from './color';
import { useDrawerTheme } from './Context';

export function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const colors = useDrawerTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: '600', color: colors.text, marginBottom: 6 }}>Choose a color</Text>
      <input
        type="color"
        aria-label="Choose badge text color"
        value={hexToRgb(value) ? value : '#000000'}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{ width: 64, height: 40, cursor: 'pointer' }}
      />
    </View>
  );
}
