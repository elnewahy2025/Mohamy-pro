import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { S3ObjectStorageService } from '../../infrastructure/storage/object-storage.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import {
  HierarchyOperations,
  type HierarchyContext,
} from './hierarchy.operations';

export interface OrganizationProfileInput {
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  mapUrl?: string;
  registrationNumber?: string;
  taxNumber?: string;
  baseCurrency?: string;
  socialLinks?: Record<string, string>;
}

export interface CreateOrganizationInput extends OrganizationProfileInput {
  slug: string;
  name: string;
}

export interface UpdateOrganizationInput extends OrganizationProfileInput {
  id: string;
  slug?: string;
  name?: string;
}

export interface OrganizationResult {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  mapUrl: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  baseCurrency: string;
  logoObjectKey: string | null;
  socialLinks: Record<string, string>;
}

function toOrganizationResult(row: {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  mapUrl: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  baseCurrency: string;
  logoObjectKey: string | null;
  socialLinks: unknown;
}): OrganizationResult {
  return {
    ...row,
    socialLinks:
      row.socialLinks && typeof row.socialLinks === 'object'
        ? (row.socialLinks as Record<string, string>)
        : {},
  };
}

const ORG_SELECT = {
  id: true,
  tenantId: true,
  slug: true,
  name: true,
  status: true,
  website: true,
  contactEmail: true,
  contactPhone: true,
  addressLine1: true,
  city: true,
  country: true,
  postalCode: true,
  mapUrl: true,
  registrationNumber: true,
  taxNumber: true,
  baseCurrency: true,
  logoObjectKey: true,
  socialLinks: true,
} as const;

function profileData(input: OrganizationProfileInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of [
    'website',
    'contactEmail',
    'contactPhone',
    'addressLine1',
    'city',
    'country',
    'postalCode',
    'mapUrl',
    'registrationNumber',
    'taxNumber',
    'baseCurrency',
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.socialLinks !== undefined) {
    for (const [network, url] of Object.entries(input.socialLinks)) {
      if (typeof url !== 'string' || url.length > 500) {
        throw new OrganizationConfigDeniedError('INVALID_SOCIAL_LINKS');
      }
      void network;
    }
    data.socialLinks = input.socialLinks;
  }
  return data;
}

const TARGET = 'Organization';

/**
 * Tenant-scoped Organization ownership record. Creation, mutation and archive
 * are guarded by the CanManageOrganizationConfig policy and emit an audit
 * event atomically with the change (see HierarchyOperations).
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly ops: HierarchyOperations,
    private readonly storage: S3ObjectStorageService,
    private readonly prisma: PrismaService,
  ) {}

  async context(request: Request): Promise<{
    organization: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      baseCurrency: string;
    } | null;
    branch: { id: string; name: string } | null;
  }> {
    const auth = request.auth;
    if (!auth) throw new OrganizationConfigDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new OrganizationConfigDeniedError('TENANT_CONTEXT_REQUIRED');
    const tenantId: string = auth.activeTenantId;
    return this.prisma.withMembershipSelectionContext(
      { userId: auth.userId, operationId: auth.sessionId },
      async (transaction) => {
        const [org, membership] = await Promise.all([
          transaction.organization.findFirst({
            where: { tenantId, status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              slug: true,
              logoObjectKey: true,
              baseCurrency: true,
            },
          }),
          transaction.membership.findFirst({
            where: { userId: auth.userId, tenantId },
            select: { id: true, branchId: true },
          }),
        ]);
        let logoUrl: string | null = null;
        if (org?.logoObjectKey) {
          try {
            logoUrl = await this.storage.getDownloadUrl(
              tenantId,
              org.logoObjectKey,
              3600,
            );
          } catch {
            logoUrl = null;
          }
        }
        let branch: { id: string; name: string } | null = null;
        if (membership?.branchId) {
          const row = await transaction.branch.findFirst({
            where: { id: membership.branchId, tenantId },
            select: { id: true, name: true },
          });
          if (row) branch = row;
        }
        return {
          organization: org
            ? {
                id: org.id,
                name: org.name,
                slug: org.slug,
                logoUrl,
                baseCurrency: org.baseCurrency,
              }
            : null,
          branch,
        };
      },
    );
  }

  async uploadLogo(
    request: Request,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new OrganizationConfigDeniedError('INVALID_LOGO_TYPE');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new OrganizationConfigDeniedError('LOGO_TOO_LARGE');
    }
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await transaction.organization.findFirst({
          where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!current)
          throw new OrganizationConfigDeniedError('NO_ORGANIZATION');
        const key = `logos/${ctx.tenantId}/${current.id}.png`;
        await this.storage.putObject({
          tenantId: ctx.tenantId,
          key,
          body: file.buffer,
          contentType: file.mimetype,
        });
        const row = await transaction.organization.update({
          where: { id: current.id },
          data: { logoObjectKey: key },
          select: ORG_SELECT,
        });
        return toOrganizationResult(row);
      },
    );
  }

  async create(
    request: Request,
    input: CreateOrganizationInput,
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_CREATED,
      TARGET,
      async (transaction) => {
        const existing = await transaction.organization.findFirst({
          where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (existing) throw new OrganizationConfigDeniedError('ORG_EXISTS');
        const row = await transaction.organization.create({
          data: {
            tenantId: ctx.tenantId,
            slug: input.slug,
            name: input.name,
            ...profileData(input),
          },
          select: ORG_SELECT,
        });
        return toOrganizationResult(row);
      },
      { slug: input.slug },
    );
  }

  async update(
    request: Request,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireOrg(transaction, ctx, input.id);
        const row = await transaction.organization.update({
          where: { id: current.id },
          data: {
            slug: input.slug ?? current.slug,
            name: input.name ?? current.name,
            ...profileData(input),
          },
          select: ORG_SELECT,
        });
        return toOrganizationResult(row);
      },
    );
  }

  async archive(
    request: Request,
    id: string,
    reason?: string,
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_ARCHIVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireOrg(transaction, ctx, id);
        const row = await transaction.organization.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
          select: ORG_SELECT,
        });
        return toOrganizationResult(row);
      },
      reason ? { reason } : undefined,
    );
  }

  async list(request: Request): Promise<OrganizationResult[]> {
    const ctx = await this.ops.authorize(request);
    const rows = await this.ops.read(request, ctx, (transaction) =>
      transaction.organization.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { name: 'asc' },
        take: 100,
        select: ORG_SELECT,
      }),
    );
    return rows.map(toOrganizationResult);
  }

  private async requireOrg(
    transaction: Prisma.TransactionClient,
    ctx: HierarchyContext,
    id: string,
  ): Promise<{
    id: string;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }> {
    const current = await transaction.organization.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!current) throw new OrganizationConfigDeniedError('NO_ORGANIZATION');
    return current;
  }
}
