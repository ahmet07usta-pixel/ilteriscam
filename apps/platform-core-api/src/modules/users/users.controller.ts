import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  listUsers() {
    return this.usersService.listUsers();
  }

  @Post()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  createUser(
    @Body()
    payload: {
      email: string;
      phone?: string;
      fullName: string;
      password: string;
      role: Role;
      permissions?: string[];
    },
  ) {
    return this.usersService.createUser(payload);
  }
}
