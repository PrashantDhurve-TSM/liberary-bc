import {
  Injectable,
  NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { from, mergeMap, map } from 'rxjs';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import { Role } from '../enums/role.enum.js';
import { AuditLog } from './entities/audit-log.entity.js';

type AuditedRequest = Request & {
  user?: AuthenticatedPrincipal;
  route?: { path?: string };
};

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const method = request.method.toUpperCase();
    const actor = request.user;
    if (
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ||
      !actor ||
      ![Role.ADMIN, Role.LIBRARIAN].includes(actor.role)
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap((response) => {
        const resourceId = Object.values(request.params ?? {}).find(
          (value) => typeof value === 'string' && value.length <= 100,
        );
        const resource = `${request.baseUrl}${request.route?.path || request.path}`;
        const entry = this.auditLogModel.create({
          actor: new Types.ObjectId(actor.userId),
          actorRole: actor.role,
          method,
          resource: resource.slice(0, 200),
          ...(typeof resourceId === 'string' && resourceId.length <= 100
            ? { resourceId }
            : {}),
        });
        return from(entry).pipe(map(() => response));
      }),
    );
  }
}
