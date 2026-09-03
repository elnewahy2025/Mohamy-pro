import { Test, TestingModule } from '@nestjs/testing';
import { PartyService } from './party.service';
import { PartyOperations } from './party.operations';
import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

describe('PartyService', () => {
  let service: PartyService;
  let mockOps: jest.Mocked<PartyOperations>;

  const mockCtx = {
    sessionId: 'session-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    actorMembershipId: 'mem-1',
  };

  const mockRequest = {} as Request;

  beforeEach(async () => {
    mockOps = {
      authorize: jest.fn().mockResolvedValue(mockCtx),
      run: jest.fn().mockImplementation((req, ctx, type, target, op) => op({})),
      read: jest.fn().mockImplementation((req, ctx, op) => op({})),
      requirePartyInTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PartyOperations>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartyService,
        { provide: PartyOperations, useValue: mockOps },
      ],
    }).compile();

    service = module.get<PartyService>(PartyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a party', async () => {
      const dto = { partyType: 'PERSON' as const, displayName: 'John Doe' };
      const mockParty = { id: 'party-1', ...dto };
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          party: { create: jest.fn().mockResolvedValue(mockParty) },
        };
        return op(tx as any);
      });

      const result = await service.create(mockRequest, dto);
      expect(result).toEqual(mockParty);
    });
  });
});
