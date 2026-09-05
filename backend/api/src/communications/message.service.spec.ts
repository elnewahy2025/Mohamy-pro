import { MessageService } from './message.service';
import {
  CommunicationsInvalidStateError,
  CommunicationsNotFoundError,
} from './communications.errors';

function service() {
  const timeline = { recordEvent: jest.fn() };
  return { timeline, svc: new MessageService(timeline as any) };
}

const baseTx = () => ({
  case: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
  client: { findFirst: jest.fn().mockResolvedValue({ id: 'cl1' }) },
  task: { findFirst: jest.fn().mockResolvedValue({ id: 't1' }) },
  messageThread: { findFirst: jest.fn() },
  messageConsent: { findFirst: jest.fn().mockResolvedValue(null) },
  message: { create: jest.fn().mockImplementation(({ data }: any) => data) },
});

describe('MessageService', () => {
  it('requires a case, client, or task link', async () => {
    const { svc } = service();
    await expect(
      svc.compose(baseTx() as any, 't1', 'u1', 'm1', {
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        body: 'Hello',
      } as any),
    ).rejects.toBeInstanceOf(CommunicationsInvalidStateError);
  });

  it('rejects outbound sends to opted-out clients', async () => {
    const tx = baseTx();
    (tx.messageConsent.findFirst as jest.Mock).mockResolvedValue({
      status: 'OPT_OUT',
    });
    const { svc } = service();
    await expect(
      svc.compose(tx as any, 't1', 'u1', 'm1', {
        channel: 'SMS',
        direction: 'OUTBOUND',
        body: 'Hello',
        clientId: 'cl1',
      } as any),
    ).rejects.toBeInstanceOf(CommunicationsInvalidStateError);
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it('queues outbound and emits NOTE_ADDED for internal case messages', async () => {
    const tx = baseTx();
    const { svc, timeline } = service();
    const created: any = await svc.compose(tx as any, 't1', 'u1', 'm1', {
      channel: 'INTERNAL',
      direction: 'OUTBOUND',
      body: 'Note',
      caseId: 'c1',
    } as any);
    expect(created.status).toBe('QUEUED');
    expect(timeline.recordEvent).toHaveBeenCalledWith(
      tx,
      't1',
      'u1',
      'm1',
      expect.objectContaining({ caseId: 'c1', eventType: 'NOTE_ADDED' }),
    );
  });

  it('records inbound as delivered without timeline noise', async () => {
    const tx = baseTx();
    const { svc, timeline } = service();
    const created: any = await svc.compose(tx as any, 't1', 'u1', 'm1', {
      channel: 'EMAIL',
      direction: 'INBOUND',
      body: 'Reply',
      clientId: 'cl1',
    } as any);
    expect(created.status).toBe('DELIVERED');
    expect(timeline.recordEvent).not.toHaveBeenCalled();
  });

  it('rejects unknown linked records', async () => {
    const tx = baseTx();
    (tx.case.findFirst as jest.Mock).mockResolvedValue(null);
    const { svc } = service();
    await expect(
      svc.compose(tx as any, 't1', 'u1', 'm1', {
        channel: 'EMAIL',
        direction: 'INBOUND',
        body: 'Hi',
        caseId: 'missing',
      } as any),
    ).rejects.toBeInstanceOf(CommunicationsNotFoundError);
  });
});
