import { UserStatus } from '@prisma/client';
import { AUTH_PROVIDER } from './auth.constants';
import { IdentityService } from './identity.service';

function prismaMock() {
  return {
    externalIdentity: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({}),
    ),
  };
}

const profile = {
  subject: 'logto-subject-1',
  email: 'User@Example.com',
  displayName: 'Test User',
  giveName: 'Test',
  locale: 'en',
  providerSessionId: 'sid-1',
};

describe('IdentityService', () => {
  let service: IdentityService;
  let prisma: ReturnType<typeof prismaMock>;

  beforeEach(() => {
    prisma = prismaMock();
    jest.clearAllMocks();
    service = new IdentityService(prisma as any);
  });

  it('returns the existing user when their external identity is already linked', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue({
      userId: 'user-1',
      user: { id: 'user-1', status: UserStatus.ACTIVE },
    });

    const result = await service.resolveUser(profile);

    expect(result).toEqual({ id: 'user-1', status: UserStatus.ACTIVE });
    expect(prisma.externalIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_subject: {
            provider: AUTH_PROVIDER,
            subject: 'logto-subject-1',
          },
        },
      }),
    );
  });

  it('creates a linking external identity when no existing link resolves', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue(null);
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      externalIdentity: { create: jest.fn() },
    };
    const userRecord = { id: 'user-new', status: UserStatus.PENDING };
    tx.user.create.mockResolvedValue(userRecord);
    prisma.$transaction.mockImplementation(
      async (callback: (inner: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await service.resolveUser(profile);

    expect(result).toEqual({ id: 'user-new', status: UserStatus.PENDING });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: UserStatus.PENDING,
          emailNormalized: 'user@example.com',
        }),
      }),
    );
    expect(tx.externalIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-new',
          provider: AUTH_PROVIDER,
          subject: 'logto-subject-1',
        }),
      }),
    );
  });

  it('reuses an existing user by normalized email when email is present', async () => {
    prisma.externalIdentity.findUnique.mockResolvedValue(null);
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
        }),
        create: jest.fn(),
      },
      externalIdentity: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (inner: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await service.resolveUser(profile);

    expect(result).toEqual({ id: 'user-1', status: UserStatus.ACTIVE });
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { emailNormalized: 'user@example.com' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
