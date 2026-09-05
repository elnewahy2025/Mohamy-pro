import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { CurrencyCode, FeeKind } from '@prisma/client';

export class CreateFeeDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsEnum(FeeKind)
  kind!: FeeKind;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  amount!: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsUUID()
  @IsOptional()
  rateId?: string;
}

export class CreateExpenseDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  amount!: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsUUID()
  @IsOptional()
  receiptObjectId?: string;
}

export class CreateInvoiceDto {
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @IsUUID()
  @IsOptional()
  taxRuleId?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  timeEntryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  feeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  expenseIds?: string[];
}

export class CreatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @IsNumber()
  amount!: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsString()
  @IsOptional()
  providerRef?: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class CreateCreditDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  caseId?: string;

  @IsNumber()
  amount!: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;
}

export class ApplyCreditDto {
  @IsUUID()
  invoiceId!: string;

  @IsNumber()
  amount!: number;
}

export class CreateRefundDto {
  @IsUUID()
  paymentId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateTaxRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  rate!: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
