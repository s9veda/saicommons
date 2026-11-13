import React from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';
import type { DrawerTheme } from './theme';
import { createStyles, createColors } from './ui';
import { useDrawerTheme } from './Context';
import { Button } from './Button';

export function ConfirmDialog({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}) {
  const theme = useDrawerTheme();
  const colors = createColors(theme);
  const styles = createStyles(theme);
  
  if (!visible) return null;
  
  return (
    <Modal visible={visible} transparent animationType="none" presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onCancel} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: 16 }}>{message}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
            <Button title={cancelText} kind="secondary" onPress={onCancel} />
            <Button title={confirmText} kind={destructive ? 'danger' : 'primary'} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}