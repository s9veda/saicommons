// Example usage for sibling apps (saimantrajapam, saibhjanastudio)
//
// This file demonstrates how to integrate the @saicommons/drawer package
// into another Expo/React Native application.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { 
  ProfileButton, 
  ProfileDrawer, 
  configureApi, 
  loadToken, 
  setToken,
  api,
  type User,
  createTheme 
} from '@saicommons/drawer';

// 1. Configure the API client (do this once at app startup)
configureApi({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  apiKey: process.env.EXPO_PUBLIC_API_KEY ?? '',
});

// 2. Optional: Create a custom theme for your app
const appTheme = createTheme({
  primary: '#21483B',      // Your brand primary color
  primaryLight: '#DCE7DB', // Lighter version for backgrounds
  bg: '#F7F4EC',           // Main background
  surface: '#FFFEFA',      // Card/surface background
  // ... other colors will use defaults
});

export default function App() {
  return <SafeAreaProvider><DrawerExampleApp /></SafeAreaProvider>;
}

function DrawerExampleApp() {
  const [me, setMe] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);

  // 3. Restore session on app start
  const restore = useCallback(async () => {
    setBooting(true);
    try {
      if (await loadToken()) {
        try {
          const { user } = await api.getSession();
          // Check permissions if needed
          if (user.is_admin) {
            setMe(user);
          } else {
            await signOut();
          }
        } catch {
          await signOut();
        }
      } else {
        setProfileOpen(true); // Show login
      }
    } catch (e) {
      console.error('Restore failed:', e);
      setProfileOpen(true);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { void restore(); }, [restore]);

  // 4. Sign out handler
  const signOut = useCallback(async () => {
    await setToken(null);
    setMe(null);
    setProfileOpen(true);
  }, []);

  if (booting) {
    return <ActivityIndicator style={{ marginTop: 80 }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: appTheme.bg }}>
      {/* Your app header with profile button */}
      <View style={{ 
        backgroundColor: appTheme.primary, 
        paddingTop: 50, 
        paddingBottom: 16,
        paddingHorizontal: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Text style={{ color: appTheme.white, fontSize: 20, fontWeight: '700' }}>
          My App
        </Text>
        <ProfileButton 
          user={me} 
          onPress={() => setProfileOpen(true)} 
          theme={appTheme}
        />
      </View>

      {/* Your app content */}
      <View style={{ flex: 1, padding: 16 }}>
        {me ? (
          <Text style={{ color: appTheme.text, fontSize: 18 }}>
            Welcome, {me.name}!
          </Text>
        ) : (
          <Text style={{ color: appTheme.muted, fontSize: 18 }}>
            Please sign in to continue
          </Text>
        )}
      </View>

      {/* 5. Profile Drawer */}
      <ProfileDrawer
        visible={profileOpen}
        user={me}
        onClose={() => setProfileOpen(false)}
        onSignedIn={(user) => { 
          setMe(user); 
          setProfileOpen(false); 
        }}
        onSignOut={signOut}
        theme={appTheme}
        authConfig={{
          checkPermissions: (user) => user.is_admin,
          permissionErrorMessage: 'Administrator access required'
        }}
      />
    </View>
  );
}