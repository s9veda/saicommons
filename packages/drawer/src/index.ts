// Main exports for @saicommons/drawer

// Theme
export { defaultTheme, createTheme, type DrawerTheme } from './theme';

// Types
export type { 
  BaseUser, 
  User, 
  AuthConfig, 
  ProfileButtonProps, 
  ProfileDrawerProps, 
  LoginScreenProps 
} from './types';

// API
export { 
  loadToken, 
  setToken, 
  getToken, 
  configureApi, 
  login, 
  verifyOtp, 
  getSession, 
  api,
  ApiError,
  type Center,
  type UserInput,
  type LoginResult,
  type RequestConfig
} from './api';

// UI Components
export { 
  DrawerThemeProvider, 
  useDrawerTheme 
} from './Context';

export { 
  createStyles, 
  createColors 
} from './ui';

export { Button } from './Button';
export { AddButton } from './AddButton';
export { Field } from './Field';
export { ManagementHeader } from './ManagementHeader';
export { ManagementSearch } from './ManagementSearch';
export { ErrorText } from './ErrorText';
export { ConfirmDialog } from './ConfirmDialog';

// Main Drawer Components
export { ProfileButton } from './ProfileButton';
export { ProfileDrawer } from './ProfileDrawer';
export { LoginScreen } from './LoginScreen';
export { CentersScreen } from './CentersScreen';
export { UsersScreen } from './UsersScreen';

// Utility
export { getDrawerStyles } from './DrawerStyles';
export { 
  renderDefaultHeader, 
  renderStatusBadge, 
  renderDefaultAccessSection, 
  renderSignOutButton, 
  renderErrorText, 
  renderUserIdentity 
} from './DrawerRender';

// Color utilities
export { hexToRgb, rgbToHex } from './color';