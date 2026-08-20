import { Role } from '@prisma/client';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: Role;
  permissions: string[];
  tokenType: 'access' | 'refresh';
};
