import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { runtimeConfig } from './config/app.config';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { AuditModule } from './modules/audit/audit.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductionsModule } from './modules/productions/productions.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { QuotationCalculationsModule } from './modules/quotation-calculations/quotation-calculations.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RedisModule } from './modules/redis/redis.module';
import { RequestItemsModule } from './modules/request-items/request-items.module';
import { RequestsModule } from './modules/requests/requests.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { UsersModule } from './modules/users/users.module';
import { CompanyFoundationModule } from './modules/company-foundation/company-foundation.module';
import { ManufacturerCustomersModule } from './modules/manufacturer-customers/manufacturer-customers.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [runtimeConfig],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TerminusModule,
    PrismaModule,
    RedisModule,
    RbacModule,
    AuditModule,
    UsersModule,
    AuthModule,
    AttachmentsModule,
    AnalysisModule,
    NotificationsModule,
    HealthModule,
    GatewayModule,
    CompanyFoundationModule,
    RequestsModule,
    RequestItemsModule,
    QuotationsModule,
    QuotationCalculationsModule,
    OrdersModule,
    ProductionsModule,
    ShipmentsModule,
    ManufacturerCustomersModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
