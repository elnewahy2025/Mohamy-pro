import { Test, TestingModule } from '@nestjs/testing';
import { LegalConfigService } from './legal-config.service';
import { LegalConfigOperations } from './legal-config.operations';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';

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
      });
    }),
    auditChange: jest.fn(),
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
  });
});
