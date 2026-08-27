import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CompanyMembershipStatus, Role } from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateMessageDto } from './dto/create-message.dto';

type ConversationPair = { requestId: string; counterpartyCompanyId: string };

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private requireActor(actor?: AuthenticatedUser): AuthenticatedUser {
    if (!actor) {
      throw new UnauthorizedException('Authentication required');
    }
    return actor;
  }

  private canManageScope(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN
      || actor.role === Role.MANAGER
      || actor.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  }

  private async findActiveMembershipCompanyId(
    actor: AuthenticatedUser,
    candidateCompanyIds: string[],
  ): Promise<string | null> {
    const membership = await this.prisma.companyUserMembership.findFirst({
      where: {
        userId: actor.sub,
        status: CompanyMembershipStatus.ACTIVE,
        companyId: { in: candidateCompanyIds },
      },
      select: { companyId: true },
    });
    return membership?.companyId ?? null;
  }

  private async loadRequestOrThrow(requestId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, companyId: true, requestNumber: true, title: true },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  private async assertThreadAccess(
    requestId: string,
    counterpartyCompanyId: string,
    actor: AuthenticatedUser,
  ) {
    const request = await this.loadRequestOrThrow(requestId);

    if (this.canManageScope(actor)) {
      return request;
    }

    const membershipCompanyId = await this.findActiveMembershipCompanyId(actor, [
      request.companyId,
      counterpartyCompanyId,
    ]);
    if (!membershipCompanyId) {
      throw new ForbiddenException('You do not have access to this conversation');
    }

    if (membershipCompanyId === counterpartyCompanyId && counterpartyCompanyId !== request.companyId) {
      const recipient = await this.prisma.requestRecipient.findUnique({
        where: { requestId_companyId: { requestId, companyId: counterpartyCompanyId } },
        select: { id: true },
      });
      if (!recipient) {
        throw new ForbiddenException('You do not have access to this conversation');
      }
    }

    return request;
  }

  async listThread(requestId: string, counterpartyCompanyId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.assertThreadAccess(requestId, counterpartyCompanyId, authenticatedActor);

    return this.prisma.message.findMany({
      where: { requestId, counterpartyCompanyId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async postMessage(requestId: string, input: CreateMessageDto, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    const request = await this.loadRequestOrThrow(requestId);

    const senderCompanyId = await this.findActiveMembershipCompanyId(authenticatedActor, [
      request.companyId,
      input.counterpartyCompanyId,
    ]);
    if (!senderCompanyId) {
      throw new ForbiddenException('You do not have access to this conversation');
    }

    if (senderCompanyId === input.counterpartyCompanyId && input.counterpartyCompanyId !== request.companyId) {
      const recipient = await this.prisma.requestRecipient.findUnique({
        where: { requestId_companyId: { requestId, companyId: input.counterpartyCompanyId } },
        select: { id: true },
      });
      if (!recipient) {
        throw new ForbiddenException('You do not have access to this conversation');
      }
    }

    const message = await this.prisma.message.create({
      data: {
        requestId,
        counterpartyCompanyId: input.counterpartyCompanyId,
        senderCompanyId,
        authorUserId: authenticatedActor.sub,
        body: input.body,
      },
      include: { author: { select: { id: true, fullName: true, email: true } } },
    });

    const recipientCompanyId = senderCompanyId === request.companyId
      ? input.counterpartyCompanyId
      : request.companyId;

    await this.notificationsService.notifyCompany(recipientCompanyId, {
      type: 'NEW_MESSAGE',
      title: `Yeni mesaj: ${request.requestNumber}`,
      body: input.body.slice(0, 200),
      payload: { requestId, counterpartyCompanyId: input.counterpartyCompanyId },
    });

    return message;
  }

  async listConversations(actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    let pairs: ConversationPair[];
    if (this.canManageScope(authenticatedActor)) {
      const threads = await this.prisma.message.findMany({
        distinct: ['requestId', 'counterpartyCompanyId'],
        orderBy: { createdAt: 'desc' },
        select: { requestId: true, counterpartyCompanyId: true },
      });
      pairs = threads;
    } else {
      const memberships = await this.prisma.companyUserMembership.findMany({
        where: { userId: authenticatedActor.sub, status: CompanyMembershipStatus.ACTIVE },
        select: { companyId: true },
      });
      const companyIds = memberships.map((membership) => membership.companyId);
      if (companyIds.length === 0) {
        return [];
      }

      const asBuyer = await this.prisma.request.findMany({
        where: { companyId: { in: companyIds }, recipients: { some: {} } },
        select: { id: true, recipients: { select: { companyId: true } } },
      });
      const buyerPairs: ConversationPair[] = asBuyer.flatMap((request) =>
        request.recipients.map((recipient) => ({ requestId: request.id, counterpartyCompanyId: recipient.companyId })),
      );

      const asRecipient = await this.prisma.requestRecipient.findMany({
        where: { companyId: { in: companyIds } },
        select: { requestId: true, companyId: true },
      });
      const recipientPairs: ConversationPair[] = asRecipient.map((recipient) => ({
        requestId: recipient.requestId,
        counterpartyCompanyId: recipient.companyId,
      }));

      const dedupeKey = (pair: ConversationPair) => `${pair.requestId}:${pair.counterpartyCompanyId}`;
      pairs = Array.from(
        new Map([...buyerPairs, ...recipientPairs].map((pair) => [dedupeKey(pair), pair])).values(),
      );
    }

    return this.hydrateConversations(pairs);
  }

  private async hydrateConversations(pairs: ConversationPair[]) {
    const results = await Promise.all(
      pairs.map(async (pair) => {
        const [request, counterpartyCompany, lastMessage, messageCount] = await Promise.all([
          this.prisma.request.findUnique({
            where: { id: pair.requestId },
            select: {
              id: true,
              requestNumber: true,
              title: true,
              companyId: true,
              company: { select: { id: true, legalName: true, tradeName: true } },
            },
          }),
          this.prisma.company.findUnique({
            where: { id: pair.counterpartyCompanyId },
            select: { id: true, legalName: true, tradeName: true },
          }),
          this.prisma.message.findFirst({
            where: { requestId: pair.requestId, counterpartyCompanyId: pair.counterpartyCompanyId },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.message.count({
            where: { requestId: pair.requestId, counterpartyCompanyId: pair.counterpartyCompanyId },
          }),
        ]);

        return {
          requestId: pair.requestId,
          requestNumber: request?.requestNumber ?? null,
          requestTitle: request?.title ?? null,
          buyerCompany: request?.company ?? null,
          counterpartyCompanyId: pair.counterpartyCompanyId,
          counterpartyCompany,
          lastMessage,
          messageCount,
        };
      }),
    );

    return results.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() ?? 0;
      const bTime = b.lastMessage?.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });
  }
}
