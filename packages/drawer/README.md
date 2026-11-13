# @saicommons/drawer

A reusable profile drawer component for React Native / Expo applications. Provides a slide-in drawer with authentication, user profile display, and sign-out functionality.

## Installation

```bash
npm install @saicommons/drawer
```

## Peer Dependencies

The following peer dependencies are required:

- `react`: 19.3.0
- `react-native`: 0.88.1
- `expo-secure-store`: ~58.0.2
- `lucide-react-native`: ^1.61.0
- `react-native-safe-area-context`: ~5.11.1
- `expo-status-bar`: ~58.0.4

## Usage

### Basic Setup

```tsx
import { ProfileButton, ProfileDrawer, configureApi, setToken, type User } from '@saicommons/drawer';

// Configure the API (typically in your app initialization)
configureApi({
  baseUrl: 'https://your-api.example.com',
  apiKey: 'your-api-key'
});

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const signOut = async () => {
    await setToken(null);
    setUser(null);
    setProfileOpen(true); // Show drawer in signed-out state
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Your app content */}
      
      {/* Profile button in header */}
      <ProfileButton 
        user={user} 
        onPress={() => setProfileOpen(true)} 
      />
      
      {/* Profile drawer */}
      <ProfileDrawer
        visible={profileOpen}
        user={user}
        onClose={() => setProfileOpen(false)}
        onSignedIn={(user) => {
          setUser(user);
          setProfileOpen(false);
        }}
        onSignOut={signOut}
        enableManagement
      />
    </View>
  );
}
```

Each host app supplies its own client key and API URL when calling `configureApi`;
the drawer does not contain credentials. An empty base URL uses the current
origin on web, while native apps require a URL. Apps that make authenticated
requests should use the drawer's `loadToken`, `getToken`, and `setToken` so
their API client shares the drawer's session.

The sign-in form has no app-specific description by default. Hosts can supply
`signedOutDescription` to show one, or `signedOutContent` to replace the form.

Set `enableManagement` to expose center and user management to administrators.
The drawer opens the reusable management screens and uses the configured API
and session for CRUD requests. The server must enforce administrator
permissions; hiding buttons is not authorization. Pass `onManagementChanged`
to refresh the host app's own data after a change. Without this option,
management remains hidden. Non-admin profiles show their associated and editor
centers, resolving their names through the configured API.

### Theming

Customize the appearance by passing a theme override:

```tsx
import { createTheme, ProfileDrawer } from '@saicommons/drawer';

const myTheme = createTheme({
  primary: '#1A3C5E',
  primaryLight: '#D6E8F7',
  bg: '#F5F9FC',
  surface: '#FFFFFF',
  // ... other colors
});

<ProfileDrawer
  // ... other props
  theme={myTheme}
/>
```

### Custom Authentication Logic

Provide custom authentication configuration:

```tsx
<ProfileDrawer
  // ... other props
  authConfig={{
    checkPermissions: async (user) => user.is_admin,
    permissionErrorMessage: 'Admin access required',
    loginEndpoint: '/v1/custom-login',
    verifyEndpoint: '/v1/custom-verify-otp'
  }}
/>
```

### Custom Content

Override default drawer sections:

```tsx
<ProfileDrawer
  // ... other props
  headerContent={<CustomHeader />}
  signedInContent={<CustomSignedInContent user={user} />}
  signedOutContent={<CustomLoginScreen />}
/>
```

## Exported Components

### Main Components
- `ProfileButton` - Circular button to open the drawer
- `ProfileDrawer` - Main drawer component with auth flow
- `LoginScreen` - Standalone login screen component
- `CentersScreen`, `UsersScreen` - Management screens for hosts with their own navigation

### Theme
- `defaultTheme` - Default color theme
- `createTheme(partialTheme)` - Create custom theme
- `DrawerTheme` - Theme type

### UI Components
- `Button` - Themed button component
- `AddButton` - Floating action button
- `Field` - Form input field
- `ManagementHeader` - Section header with add button
- `ManagementSearch` - Search input
- `ErrorText` - Error message display
- `ConfirmDialog` - Confirmation modal

### API
- `loadToken()` - Load auth token from storage
- `setToken(token)` - Save/clear auth token
- `getToken()` - Get current token
- `configureApi(config)` - Configure API client
- `login(email)` - Login with email
- `verifyOtp(email, code)` - Verify OTP
- `getSession()` - Get current session

### Types
- `User` - Base user interface (extensible)
- `AuthConfig` - Authentication configuration
- `ProfileButtonProps` - ProfileButton props
- `ProfileDrawerProps` - ProfileDrawer props
- `LoginScreenProps` - LoginScreen props

## Platform Support

- ✅ iOS
- ✅ Android
- ✅ Web

## License

MIT