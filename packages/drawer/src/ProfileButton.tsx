import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { CircleUserRound } from 'lucide-react-native';
import type { User, ProfileButtonProps, DrawerTheme } from './types';
import { defaultTheme } from './theme';

export function ProfileButton({ user, onPress, theme }: ProfileButtonProps) {
  const resolvedTheme = theme ?? defaultTheme;
  
  const styleObj = StyleSheet.create({
    profileButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#426756', alignItems: 'center', justifyContent: 'center' },
    onlineDot: { position: 'absolute', right: 1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#78B68E', borderWidth: 1.5, borderColor: resolvedTheme.primary },
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={user ? 'Open profile' : 'Sign in or view profile'}
      onPress={onPress}
      style={styleObj.profileButton}
    >
      <CircleUserRound color={resolvedTheme.white} size={21} strokeWidth={1.8} />
      {user && <View style={styleObj.onlineDot} />}
    </Pressable>
  );
}