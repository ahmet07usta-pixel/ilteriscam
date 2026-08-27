import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('messages/conversations')
  @Permissions(PERMISSIONS.MESSAGES_READ)
  listConversations(@CurrentUser() actor: AuthenticatedUser) {
    return this.messagesService.listConversations(actor);
  }

  @Get('requests/:requestId/messages')
  @Permissions(PERMISSIONS.MESSAGES_READ)
  listThread(
    @Param('requestId') requestId: string,
    @Query('counterpartyCompanyId') counterpartyCompanyId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagesService.listThread(requestId, counterpartyCompanyId, actor);
  }

  @Post('requests/:requestId/messages')
  @Permissions(PERMISSIONS.MESSAGES_CREATE)
  postMessage(
    @Param('requestId') requestId: string,
    @Body() body: CreateMessageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.messagesService.postMessage(requestId, body, actor);
  }
}
