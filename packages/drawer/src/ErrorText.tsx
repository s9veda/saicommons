import React from 'react';
import { Text } from 'react-native';
import type { DrawerTheme } from './theme';
import { useDrawerTheme } from './Context';

export function ErrorText({ message }: { message: string }) {
  const theme = useDrawerTheme();
  if (!message) return null;
  return <Text accessibilityRole="alert" style={{ color: theme.danger, marginTop: 8, fontSize: 13 }}>{message}</Text>;
}