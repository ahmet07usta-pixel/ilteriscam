import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AuditService } from '../../modules/audit/audit.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      ip: string;
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    if (!shouldAudit) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async () => {
        await this.auditService.record({
          actorId: request.user?.sub,
          action: request.method,
          resource: request.path,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          metadata: {},
        });
      }),
    );
  }
}
