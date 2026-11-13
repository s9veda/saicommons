/** User type - can be extended by consumers */
export interface BaseUser {
  id: string;
  email: string | null;
  name: string;
  gender: string | null;
  associated_centers: number[];
  is_admin: boolean;
  editor_for: number[];
  role: 'admin' | 'editor' | 'viewer';
}

/** Extended user type - consumers can extend this */
export type User = BaseUser & Record<string, unknown>;

/** Theme type - re-exported from theme */
export type DrawerTheme = import('./theme').DrawerTheme;

/** Configuration for authentication */
export interface AuthConfig {
  /** Check if user has required permissions after login */
  checkPermissions?: (user: User) => boolean | Promise<boolean>;
  /** Error message when permissions check fails */
  permissionErrorMessage?: string;
  /** Custom login endpoint */
  loginEndpoint?: string;
  /** Custom verify OTP endpoint */
  verifyEndpoint?: string;
}

/** Props for the ProfileButton component */
export interface ProfileButtonProps {
  user: User | null;
  onPress: () => void;
  /** Optional theme override */
  theme?: Partial<DrawerTheme>;
}

/** Props for the ProfileDrawer component */
export interface ProfileDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** Current user or null if not signed in */
  user: User | null;
  /** Called when drawer should close */
  onClose: () => void;
  /** Called after successful sign in */
  onSignedIn: (user: User) => void;
  /** Called to sign out */
  onSignOut: () => Promise<void>;
  /** Optional theme override */
  theme?: Partial<DrawerTheme>;
  /** Optional auth configuration */
  authConfig?: AuthConfig;
  /** Enable built-in center and user management for administrators */
  enableManagement?: boolean;
  /** Called after management data changes */
  onManagementChanged?: () => void | Promise<void>;
  /** Custom content to render in the drawer header */
  headerContent?: React.ReactNode;
  /** Custom content to render below user info when signed in */
  signedInContent?: React.ReactNode;
  /** Optional description shown above the sign-in form */
  signedOutDescription?: string;
  /** Custom content to render when signed out (replaces login screen) */
  signedOutContent?: React.ReactNode;
}

/** Props for LoginScreen component */
export interface LoginScreenProps {
  onSignedIn: (user: User) => void;
  theme?: Partial<DrawerTheme>;
  authConfig?: AuthConfig;
  /** Optional description shown above the sign-in form */
  signedOutDescription?: string;
}