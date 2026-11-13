import React from 'react';
import { View, Text } from 'react-native';
import type { DrawerTheme } from './theme';
import { createStyles } from './ui';
import { useDrawerTheme } from './Context';
import { AddButton } from './AddButton';

export interface ManagementHeaderProps {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
}

export function ManagementHeader({ title, description, addLabel, onAdd }: ManagementHeaderProps) {
  const theme = useDrawerTheme();
  const styles = createStyles(theme);
  
  return (
    <View style={styles.managementHeader}>
      <View style={styles.managementHeaderInner}>
        <View style={{ width: 44 }} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={styles.managementHeading}>{title}</Text>
          <Text style={styles.managementIntro}>{description}</Text>
        </View>
        <AddButton label={addLabel} onPress={onAdd} />
      </View>
    </View>
  );
}