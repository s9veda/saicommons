export { ApiError, api, loadToken, setToken, type Center, type User } from '@saicommons/drawer';

export const apiConfig = {
  baseUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  apiKey: process.env.EXPO_PUBLIC_API_KEY ?? '',
};
