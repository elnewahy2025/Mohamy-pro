import { Injectable, Scope } from '@nestjs/common';
import { LegalConfigOperations } from './legal-config.operations';
import {
  CreateCountryDto,
  CreateJurisdictionDto,
  CreateCourtDto,
  CreateCourtLocationDto,
} from './legal-config.dto';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { PERMISSION_KEYS } from '../permissions/permission.constants';

@Injectable({ scope: Scope.REQUEST })
export class LegalConfigService {
  constructor(private readonly ops: LegalConfigOperations) {}

  // --- Countries ---
  async listCountries() {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_VIEW_TENANT,
    );
    return this.ops.run(ctx, 'listCountries', async (tx) => {
      return tx.country.findMany({
        orderBy: { name: 'asc' },
      });
    });
  }

  async createCountry(dto: CreateCountryDto) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_MANAGE_GLOBAL_LEGAL_CONFIG,
    );
    return this.ops.run(ctx, 'createCountry', async (tx) => {
      const country = await tx.country.create({
        data: {
          code: dto.code,
          name: dto.name,
        },
      });
      await this.ops.auditChange(
        ctx,
        AUDIT_EVENT_TYPES.COUNTRY_CREATED,
        'Country',
        country.id,
      );
      return country;
    });
  }

  // --- Jurisdictions ---
  async listJurisdictions(countryId?: string) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_VIEW_TENANT,
    );
    return this.ops.run(ctx, 'listJurisdictions', async (tx) => {
      return tx.jurisdiction.findMany({
        where: {
          ...this.ops.hybridReadWhere(ctx),
          ...(countryId ? { countryId } : {}),
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  async createJurisdiction(dto: CreateJurisdictionDto) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_MANAGE_LEGAL_CONFIG,
    );
    return this.ops.run(ctx, 'createJurisdiction', async (tx) => {
      await this.ops.requireParentVisible(
        tx,
        ctx,
        'country',
        dto.countryId,
        'Country',
      );
      const jurisdiction = await tx.jurisdiction.create({
        data: {
          tenantId: ctx.tenantId,
          countryId: dto.countryId,
          name: dto.name,
        },
      });
      await this.ops.auditChange(
        ctx,
        AUDIT_EVENT_TYPES.JURISDICTION_CREATED,
        'Jurisdiction',
        jurisdiction.id,
      );
      return jurisdiction;
    });
  }

  // --- Courts ---
  async listCourts(jurisdictionId?: string) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_VIEW_TENANT,
    );
    return this.ops.run(ctx, 'listCourts', async (tx) => {
      return tx.court.findMany({
        where: {
          ...this.ops.hybridReadWhere(ctx),
          ...(jurisdictionId ? { jurisdictionId } : {}),
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  async createCourt(dto: CreateCourtDto) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_MANAGE_LEGAL_CONFIG,
    );
    return this.ops.run(ctx, 'createCourt', async (tx) => {
      await this.ops.requireParentVisible(
        tx,
        ctx,
        'jurisdiction',
        dto.jurisdictionId,
        'Jurisdiction',
      );
      const court = await tx.court.create({
        data: {
          tenantId: ctx.tenantId,
          jurisdictionId: dto.jurisdictionId,
          name: dto.name,
          courtType: dto.courtType,
          department: dto.department,
        },
      });
      await this.ops.auditChange(
        ctx,
        AUDIT_EVENT_TYPES.COURT_CREATED,
        'Court',
        court.id,
      );
      return court;
    });
  }

  // --- Court Locations ---
  async listCourtLocations(courtId: string) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_VIEW_TENANT,
    );
    return this.ops.run(ctx, 'listCourtLocations', async (tx) => {
      return tx.courtLocation.findMany({
        where: {
          courtId,
          ...this.ops.hybridReadWhere(ctx),
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  async createCourtLocation(dto: CreateCourtLocationDto) {
    const ctx = await this.ops.assertPermission(
      PERMISSION_KEYS.CAN_MANAGE_LEGAL_CONFIG,
    );
    return this.ops.run(ctx, 'createCourtLocation', async (tx) => {
      await this.ops.requireParentVisible(
        tx,
        ctx,
        'court',
        dto.courtId,
        'Court',
      );
      const location = await tx.courtLocation.create({
        data: {
          tenantId: ctx.tenantId,
          courtId: dto.courtId,
          name: dto.name,
          city: dto.city,
          address: dto.address,
        },
      });
      await this.ops.auditChange(
        ctx,
        AUDIT_EVENT_TYPES.COURT_LOCATION_CREATED,
        'CourtLocation',
        location.id,
      );
      return location;
    });
  }
}
