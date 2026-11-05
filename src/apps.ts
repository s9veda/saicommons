export const APPS = {
  mantrajapam: { selfSignup: true, requireName: true, displayName: 'Sai Mantra Japam' },
  bhajanstudio: { selfSignup: false, requireName: false, displayName: 'Sai Bhajan Studio' },
} as const;

export type AppName = keyof typeof APPS;
export type AppPolicy = (typeof APPS)[AppName];

export function isAppName(value: unknown): value is AppName {
  return typeof value === 'string' && Object.hasOwn(APPS, value);
}

export function reviewEnvNames(app: AppName): { email: string; password: string } {
  const suffix = app.toUpperCase();
  return { email: `REVIEW_LOGIN_${suffix}_EMAIL`, password: `REVIEW_LOGIN_${suffix}_PASSWORD` };
}
