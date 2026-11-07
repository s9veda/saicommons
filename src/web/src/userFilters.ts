import type { User } from './api';

export function usersWithEmail(users: User[]): User[] {
  return users.filter((user) => typeof user.email === 'string' && user.email.trim().length > 0);
}
