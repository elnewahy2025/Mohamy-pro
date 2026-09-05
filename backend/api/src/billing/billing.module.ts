import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingOperations } from './billing.operations';
import { FeeService } from './fee.service';
import { ExpenseService } from './expense.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { CreditService } from './credit.service';
import { RefundService } from './refund.service';
import { LedgerService } from './ledger.service';
import { TaxService } from './tax.service';
import { ReconciliationService } from './reconciliation.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { CaseTimelineModule } from '../case-timeline/case-timeline.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    PermissionsModule,
    AuthModule,
    CaseTimelineModule,
  ],
  controllers: [BillingController],
  providers: [
    BillingOperations,
    FeeService,
    ExpenseService,
    InvoiceService,
    PaymentService,
    CreditService,
    RefundService,
    LedgerService,
    TaxService,
    ReconciliationService,
  ],
  exports: [InvoiceService, PaymentService, ReconciliationService],
})
export class BillingModule {}
