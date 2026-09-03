import { Test, TestingModule } from '@nestjs/testing';
import { PartyRoleService } from './party-role.service';
import { PartyOperations } from './party.operations';
import type { Request } from 'express';

describe('PartyRoleService', () => {
  let service: PartyRoleService;
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
        PartyRoleService,
        { provide: PartyOperations, useValue: mockOps },
      ],
    }).compile();

    service = module.get<PartyRoleService>(PartyRoleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
