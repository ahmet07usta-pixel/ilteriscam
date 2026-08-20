import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Permission, ROLE_PERMISSIONS } from './permissions';

@Injectable()
export class RbacService {
  resolvePermissions(role: Role, customPermissions: string[] = []): string[] {
    const defaults = ROLE_PERMISSIONS[role] ?? [];
    return [...new Set([...defaults, ...(customPermissions as Permission[])])];
  }
}
