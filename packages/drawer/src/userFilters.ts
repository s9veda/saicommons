import type { User } from './types';

export function usersWithEmail(users: User[]): User[] {
  return users.filter((user) => typeof user.email === 'string' && user.email.trim().length > 0);
}
