# @saicommons/drawer

A shared profile drawer for Expo apps using React Native on iOS, Android, and
web (via React Native Web). The same package and API are used on all three
platforms. It is not a standalone React DOM, Swift, or Kotlin component.

## Installation

The package is local to this repository; it is not automatically published to
npm. To consume a snapshot from another app, create a tarball from this
repository and install that tarball in the host app:

```bash
# From the saicommons repository root
npm pack --workspace @saicommons/drawer
# From the host app's package directory
npm install /absolute/path/to/saicommons-drawer-0.1.0.tgz
npx expo install expo-secure-store expo-status-bar react-native-safe-area-context react-native-svg
npm install lucide-react-native
```

Repack and update the host dependency when the drawer changes. Installing a
local directory instead of a tarball may require Metro workspace/watch-folder
configuration. Avoid bundling a second React copy: the package's dependencies
are peers supplied by the host. For native apps, rebuild after adding native
dependencies. Expo web hosts also need `react-dom` and `react-native-web`.

## Peer Dependencies

The following peer dependencies are required:

- `react`: 19.3.0
- `react-native`: 0.88.1
- `expo-secure-store`: ~58.0.2
- `lucide-react-native`: ^1.61.0
- `react-native-safe-area-context`: >=5.10.1 <6
- `react-native-svg`: ^15.0.0
- `expo-status-bar`: ~58.0.4

These versions target Expo SDK 58. Other SDK or dependency versions have not
been verified.

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

Set `enableManagement` to expose center and user management to administrators
and scoped user management to center editors.
The drawer opens the reusable management screens and uses the configured API
and session for CRUD requests. The server must enforce management
permissions; hiding buttons is not authorization. Pass `onManagementChanged`
to refresh the host app's own data after a change. Without this option,
management remains hidden. Non-admin profiles show their associated and editor
centers, resolving their names through the configured API.

The built-in login and management screens use the Sai Commons API and `User`
shape. For a host with different authentication or user fields, use
`signedOutContent` for its own sign-in UI and adapt the signed-in user to
`User` before passing it to the drawer and button. Provide `signedInContent`
to replace the default access sections and avoid the built-in center lookup.
The host remains responsible for its own session restoration and sign-out.
Do not enable built-in management unless the host uses the compatible API.

For example, a host with `centerIds` and `editorFor` fields can map its
authenticated user as follows:

```tsx
const drawerUser: User | null = hostUser ? {
  id: hostUser.id,
  name: hostUser.name,
  email: hostUser.email,
  gender: hostUser.gender,
  is_admin: hostUser.role === 'admin',
  role: hostUser.role,
  associated_centers: hostUser.centerIds,
  editor_for: hostUser.editorFor,
} : null;
```

Pass `drawerUser` to both `ProfileButton` and `ProfileDrawer`. When using
`signedOutContent`, its sign-in flow must update the host user state; the
drawer calls `onSignedIn` only for its built-in login.

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
- `login(email)` - Request an email code; returns a generic `LoginRequestResult`
- `verifyOtp(email, code)` - Verify OTP; returns a `LoginResult` with user and token
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