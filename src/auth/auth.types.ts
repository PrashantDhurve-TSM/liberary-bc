import { Role } from '../enums/role.enum.js';

export interface AuthenticatedPrincipal {
  userId: string;
  email: string;
  role: Role;
}

export interface RefreshTokenClaims {
  sub: string;
  email: string;
  role: Role;
  tokenUse: 'refresh';
}

export function isRole(value: unknown): value is Role {
  return Object.values(Role).some((role) => role === value);
}
