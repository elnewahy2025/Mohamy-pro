import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PartyRelationshipService } from './party-relationship.service';
import { PartyOperations } from './party.operations';
import type { Request } from 'express';

describe('PartyRelationshipService', () => {
  let service: PartyRelationshipService;
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
        PartyRelationshipService,
        { provide: PartyOperations, useValue: mockOps },
      ],
    }).compile();

    service = module.get<PartyRelationshipService>(PartyRelationshipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject a self-relationship where fromPartyId equals toPartyId', async () => {
    await expect(
      service.create(mockRequest, 'party-1', {
        toPartyId: 'party-1',
        relationshipType: 'spouse',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
