import { Injectable } from '@nestjs/common';
import {
  CaseStatus,
  DeadlineStatus,
  HearingStatus,
  InvoiceStatus,
  NotificationStatus,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import {
  ResourceAccessService,
  type CaseAccessScope,
} from '../permissions/resource-access.service';

export interface DashboardScope {
  scope: CaseAccessScope;
  membershipId: string;
  userId: string;
}

export interface DashboardSummary {
  cases: { total: number; open: number; byStatus: Record<string, number> };
  hearings: {
    upcoming: number;
    next: Array<{
      id: string;
      caseId: string;
      date: string;
      hearingType: string | null;
      status: string;
    }>;
  };
  deadlines: {
    overdue: number;
    next: Array<{
      id: string;
      caseId: string;
      title: string;
      dueDate: string;
      status: string;
    }>;
  };
  tasks: { open: number; overdue: number; assignedToMe: number };
  billing: {
    unpaidInvoices: number;
    overdueInvoices: number;
    unpaidTotals: Record<string, string>;
  };
  activity: Array<{
    id: string;
    caseId: string;
    eventType: string;
    occurredAt: string;
  }>;
  notifications: { unread: number };
}

function addDecimal(left: string, right: string): string {
  const scale = (value: string): bigint => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(`${whole}${fraction.padEnd(4, '0').slice(0, 4)}`);
  };
  const total = scale(left) + scale(right);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(5, '0');
  const whole = digits.slice(0, -4);
  const fraction = digits.slice(-4).replace(/0+$/, '') || '0';
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

const OPEN_CASE_STATUSES: CaseStatus[] = [CaseStatus.OPEN, CaseStatus.ON_HOLD];
const UNPAID_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIALLY_PAID,
];
const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.BLOCKED,
];
const UPCOMING_HEARING_STATUSES: HearingStatus[] = [
  HearingStatus.SCHEDULED,
  HearingStatus.POSTPONED,
];
const ACTIVE_DEADLINE_STATUSES: DeadlineStatus[] = [
  DeadlineStatus.PENDING,
  DeadlineStatus.OVERDUE,
];
const UNREAD_NOTIFICATION_STATUSES: NotificationStatus[] = [
  NotificationStatus.PENDING,
  NotificationStatus.SENT,
];

@Injectable()
export class DashboardService {
  constructor(private readonly resourceAccess: ResourceAccessService) {}

  async getSummary(
    tx: Prisma.TransactionClient,
    tenantId: string,
    access: DashboardScope,
  ): Promise<DashboardSummary> {
    let caseIds: string[] | undefined;
    if (access.scope === 'ASSIGNED') {
      caseIds = await this.resourceAccess.assignedCaseIds(
        tx,
        tenantId,
        access.membershipId,
      );
    }
    const inCases = caseIds ? { in: caseIds } : undefined;
    const now = new Date();

    const [caseGroups, caseTotal] = await Promise.all([
      tx.case.groupBy({
        by: ['status'],
        where: {
          tenantId,
          ...(inCases ? { id: inCases } : {}),
        },
        _count: { _all: true },
      }),
      tx.case.count({
        where: { tenantId, ...(inCases ? { id: inCases } : {}) },
      }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const group of caseGroups) byStatus[group.status] = group._count._all;
    const open = OPEN_CASE_STATUSES.reduce(
      (sum, status) => sum + (byStatus[status] ?? 0),
      0,
    );

    const hearingWhere = {
      tenantId,
      status: { in: UPCOMING_HEARING_STATUSES },
      date: { gte: now },
      ...(inCases ? { caseId: inCases } : {}),
    };
    const [upcomingCount, upcomingHearings] = await Promise.all([
      tx.hearing.count({ where: hearingWhere }),
      tx.hearing.findMany({
        where: hearingWhere,
        orderBy: { date: 'asc' },
        take: 10,
        select: {
          id: true,
          caseId: true,
          date: true,
          hearingType: true,
          status: true,
        },
      }),
    ]);

    const [overdueDeadlines, upcomingDeadlines] = await Promise.all([
      tx.deadline.count({
        where: {
          tenantId,
          OR: [
            { status: DeadlineStatus.OVERDUE },
            { status: DeadlineStatus.PENDING, dueDate: { lt: now } },
          ],
          ...(inCases ? { caseId: inCases } : {}),
        },
      }),
      tx.deadline.findMany({
        where: {
          tenantId,
          status: { in: ACTIVE_DEADLINE_STATUSES },
          ...(inCases ? { caseId: inCases } : {}),
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        select: {
          id: true,
          caseId: true,
          title: true,
          dueDate: true,
          status: true,
        },
      }),
    ]);

    const taskScope = inCases ? { caseId: inCases } : {};
    const [openTasks, overdueTasks, myTasks] = await Promise.all([
      tx.task.count({
        where: { tenantId, status: { in: OPEN_TASK_STATUSES }, ...taskScope },
      }),
      tx.task.count({
        where: {
          tenantId,
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lt: now },
          ...taskScope,
        },
      }),
      tx.task.count({
        where: {
          tenantId,
          status: { in: OPEN_TASK_STATUSES },
          assignedUserId: access.membershipId,
          ...taskScope,
        },
      }),
    ]);

    const invoiceScope = inCases ? { caseId: inCases } : {};
    const [unpaidInvoices, overdueInvoices, unpaidRows] = await Promise.all([
      tx.invoice.count({
        where: {
          tenantId,
          status: { in: UNPAID_INVOICE_STATUSES },
          ...invoiceScope,
        },
      }),
      tx.invoice.count({
        where: {
          tenantId,
          status: { in: UNPAID_INVOICE_STATUSES },
          dueDate: { lt: now },
          ...invoiceScope,
        },
      }),
      tx.invoice.findMany({
        where: {
          tenantId,
          status: { in: UNPAID_INVOICE_STATUSES },
          ...invoiceScope,
        },
        select: { currency: true, total: true },
        take: 1000,
      }),
    ]);
    const unpaidTotals: Record<string, string> = {};
    for (const row of unpaidRows) {
      unpaidTotals[row.currency] = addDecimal(
        unpaidTotals[row.currency] ?? '0',
        row.total.toString(),
      );
    }

    const activity = await tx.caseTimelineEvent.findMany({
      where: { tenantId, ...(inCases ? { caseId: inCases } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: 10,
      select: { id: true, caseId: true, eventType: true, occurredAt: true },
    });

    const unread = await tx.notification.count({
      where: {
        tenantId,
        membershipId: access.membershipId,
        readAt: null,
        status: { in: UNREAD_NOTIFICATION_STATUSES },
      },
    });

    return {
      cases: { total: caseTotal, open, byStatus },
      hearings: {
        upcoming: upcomingCount,
        next: upcomingHearings.map((hearing) => ({
          id: hearing.id,
          caseId: hearing.caseId,
          date: hearing.date.toISOString(),
          hearingType: hearing.hearingType,
          status: hearing.status,
        })),
      },
      deadlines: {
        overdue: overdueDeadlines,
        next: upcomingDeadlines.map((deadline) => ({
          id: deadline.id,
          caseId: deadline.caseId,
          title: deadline.title,
          dueDate: deadline.dueDate.toISOString(),
          status: deadline.status,
        })),
      },
      tasks: { open: openTasks, overdue: overdueTasks, assignedToMe: myTasks },
      billing: { unpaidInvoices, overdueInvoices, unpaidTotals },
      activity: activity.map((event) => ({
        id: event.id,
        caseId: event.caseId,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
      })),
      notifications: { unread },
    };
  }
}
