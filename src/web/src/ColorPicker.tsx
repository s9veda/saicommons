import React, { useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { hexToRgb, rgbToHex } from './color';
import { colors } from './ui';

const CHANNELS = ['Red', 'Green', 'Blue'] as const;
const CHANNEL_COLORS = ['#d32f2f', '#168039', '#2563eb'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [widths, setWidths] = useState([0, 0, 0]);
  const rgb = hexToRgb(value) ?? [0, 0, 0];

  function setChannel(index: number, value: number) {
    const next: [number, number, number] = [...rgb];
    next[index] = Math.max(0, Math.min(255, Math.round(value)));
    onChange(rgbToHex(next));
  }

  function choose(index: number, event: GestureResponderEvent) {
    if (widths[index] > 0) setChannel(index, event.nativeEvent.locationX / widths[index] * 255);
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: '600', color: colors.text, marginBottom: 6 }}>Choose a color</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>Tap a bar to adjust each color channel, or enter a hex value above.</Text>
      {CHANNELS.map((channel, index) => (
        <View key={channel} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text style={{ width: 48, color: colors.text }}>{channel}</Text>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={`${channel} channel`}
            accessibilityValue={{ min: 0, max: 255, now: rgb[index] }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') setChannel(index, rgb[index] + 1);
              if (nativeEvent.actionName === 'decrement') setChannel(index, rgb[index] - 1);
            }}
            onLayout={({ nativeEvent }) => {
              setWidths((previous) => {
                if (previous[index] === nativeEvent.layout.width) return previous;
                const next = [...previous];
                next[index] = nativeEvent.layout.width;
                return next;
              });
            }}
            onPress={(event) => choose(index, event)}
            style={{ flex: 1, height: 36, justifyContent: 'center' }}
          >
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border }}>
              <View style={{ width: `${rgb[index] / 255 * 100}%`, height: 8, borderRadius: 4, backgroundColor: CHANNEL_COLORS[index] }} />
            </View>
          </Pressable>
          <Text style={{ width: 30, textAlign: 'right', color: colors.text }}>{rgb[index]}</Text>
        </View>
      ))}
    </View>
  );
}
