import { Test, TestingModule } from '@nestjs/testing';
import { LegalConfigService } from './legal-config.service';
import { LegalConfigOperations } from './legal-config.operations';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { PERMISSION_KEYS } from '../permissions/permission.constants';

describe('LegalConfigService', () => {
  let service: LegalConfigService;
  let ops: LegalConfigOperations;

  const mockCtx = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    actorMembershipId: 'member-1',
  };

  const mockOps = {
    hybridReadWhere: jest
      .fn()
      .mockReturnValue({ OR: [{ tenantId: 'tenant-1' }, { tenantId: null }] }),
    assertPermission: jest.fn().mockResolvedValue(mockCtx),
    run: jest.fn().mockImplementation((ctx, name, cb) => {
      return cb({
        country: {
          create: jest.fn().mockResolvedValue({ id: 'country-1', name: 'UAE' }),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'country-1', name: 'UAE' }]),
        },
        jurisdiction: {
          create: jest.fn().mockResolvedValue({ id: 'jur-1', name: 'Dubai' }),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'jur-1', name: 'Dubai' }]),
        },
        court: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'court-1', name: 'Dubai Courts' }),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'court-1', name: 'Dubai Courts' }]),
        },
        courtLocation: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'loc-1', name: 'Main Hall' }),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'loc-1', name: 'Main Hall' }]),
        },
      });
    }),
    auditChange: jest.fn(),
    requireParentVisible: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalConfigService,
        { provide: LegalConfigOperations, useValue: mockOps },
      ],
    }).compile();

    service = await module.resolve<LegalConfigService>(LegalConfigService);
    ops = await module.resolve<LegalConfigOperations>(LegalConfigOperations);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCountry', () => {
    it('should create a country and audit it', async () => {
      const result = await service.createCountry({ code: 'AE', name: 'UAE' });
      expect(result).toEqual({ id: 'country-1', name: 'UAE' });
      expect(ops.auditChange).toHaveBeenCalledWith(
        mockCtx,
        AUDIT_EVENT_TYPES.COUNTRY_CREATED,
        'Country',
        'country-1',
      );
    });

    it('should require the global legal-config permission', async () => {
      await service.createCountry({ code: 'AE', name: 'UAE' });
      expect(ops.assertPermission).toHaveBeenCalledWith(
        PERMISSION_KEYS.CAN_MANAGE_GLOBAL_LEGAL_CONFIG,
      );
    });
  });

  describe('createJurisdiction', () => {
    it('should create a jurisdiction and audit it', async () => {
      const result = await service.createJurisdiction({
        countryId: 'country-1',
        name: 'Dubai',
      });
      expect(result).toEqual({ id: 'jur-1', name: 'Dubai' });
      expect(ops.auditChange).toHaveBeenCalledWith(
        mockCtx,
        AUDIT_EVENT_TYPES.JURISDICTION_CREATED,
        'Jurisdiction',
        'jur-1',
      );
    });
  });

  describe('createCourt', () => {
    it('should create a court and audit it', async () => {
      const result = await service.createCourt({
        jurisdictionId: 'jur-1',
        name: 'Dubai Courts',
      });
      expect(result).toEqual({ id: 'court-1', name: 'Dubai Courts' });
      expect(ops.auditChange).toHaveBeenCalledWith(
        mockCtx,
        AUDIT_EVENT_TYPES.COURT_CREATED,
        'Court',
        'court-1',
      );
    });

    it('should reject attaching a court to a jurisdiction outside the tenant scope', async () => {
      (ops.requireParentVisible as jest.Mock).mockRejectedValueOnce(
        new Error('Jurisdiction not found in tenant scope'),
      );
      await expect(
        service.createCourt({ jurisdictionId: 'jur-b', name: 'Foreign' }),
      ).rejects.toThrow('Jurisdiction not found in tenant scope');
    });
  });

  describe('createCourtLocation', () => {
    it('should create a court location and audit it', async () => {
      const result = await service.createCourtLocation({
        courtId: 'court-1',
        name: 'Main Hall',
      });
      expect(result).toEqual({ id: 'loc-1', name: 'Main Hall' });
      expect(ops.auditChange).toHaveBeenCalledWith(
        mockCtx,
        AUDIT_EVENT_TYPES.COURT_LOCATION_CREATED,
        'CourtLocation',
        'loc-1',
      );
    });
  });

  describe('listCountries', () => {
    it('should return global countries', async () => {
      const result = await service.listCountries();
      expect(result).toEqual([{ id: 'country-1', name: 'UAE' }]);
    });
  });

  describe('listJurisdictions', () => {
    it('should return jurisdictions for the tenant scope and a country filter', async () => {
      const result = await service.listJurisdictions('country-1');
      expect(result).toEqual([{ id: 'jur-1', name: 'Dubai' }]);
    });
  });
});
