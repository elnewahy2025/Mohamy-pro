import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const INTEGRATION_KEYS = [
  'GOOGLE_CALENDAR',
  'MICROSOFT_CALENDAR',
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'PUSH',
  'PAYMENT_PSP',
  'E_INVOICE_ZATCA',
] as const;

export const WEBHOOK_EVENTS = [
  'case.created',
  'case.status.changed',
  'hearing.scheduled',
  'deadline.created',
  'deadline.overdue',
  'invoice.issued',
  'payment.received',
  'intake.approved',
  'report.run.completed',
] as const;

export class SetIntegrationDto {
  @IsBoolean()
  enabled!: boolean;

  @IsObject()
  @IsOptional()
  config?: Record<string, string>;
}

export class RegisterWebhookDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsIn([...WEBHOOK_EVENTS], { each: true })
  events!: string[];
}

export class IntegrationKeyParam {
  @IsString()
  @IsNotEmpty()
  @IsIn([...INTEGRATION_KEYS])
  key!: string;
}
