import { WorkflowService } from './workflow.service';
import {
  WorkflowInvalidStateError,
  WorkflowNotFoundError,
} from './workflow.errors';

describe('WorkflowService', () => {
  let service: WorkflowService;

  beforeEach(() => {
    service = new WorkflowService();
  });

  describe('createVersion', () => {
    const baseTx = () => {
      const workflowVersionCreate = jest.fn().mockResolvedValue({
        id: 'ver-1',
        states: [
          { id: 'state-a', name: 'Started', isInitial: true },
          { id: 'state-b', name: 'Hearing', isInitial: false },
          { id: 'state-c', name: 'Closed', isInitial: false },
        ],
      });
      const tx = {
        workflow: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'wf-1',
            tenantId: 'tenant-1',
            versions: [],
          }),
        },
        workflowVersion: {
          create: workflowVersionCreate,
          findUnique: jest.fn().mockResolvedValue({
            id: 'ver-1',
            states: [],
            transitions: [],
          }),
        },
        workflowTransition: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return { tx, workflowVersionCreate };
    };

    it('links transitions to server-created state ids', async () => {
      const { tx, workflowVersionCreate } = baseTx();

      await service.createVersion(tx as any, 'tenant-1', 'wf-1', {
        states: [
          { name: 'Started', isInitial: true },
          { name: 'Hearing' },
          { name: 'Closed' },
        ],
        transitions: [
          { fromStateName: 'Started', toStateName: 'Hearing' },
          { fromStateName: 'Hearing', toStateName: 'Closed' },
        ],
      } as any);

      expect(workflowVersionCreate).toHaveBeenCalledTimes(1);
      const createManyData = (tx.workflowTransition.createMany as jest.Mock)
        .mock.calls[0][0].data;
      expect(createManyData).toHaveLength(2);
      expect(createManyData[0]).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-1',
          versionId: 'ver-1',
          fromStateId: 'state-a',
          toStateId: 'state-b',
        }),
      );
      expect(createManyData[1]).toEqual(
        expect.objectContaining({
          fromStateId: 'state-b',
          toStateId: 'state-c',
        }),
      );
    });

    it('requires exactly one initial state', async () => {
      const tx = {
        workflow: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'wf-1',
            tenantId: 'tenant-1',
            versions: [],
          }),
        },
      } as any;

      await expect(
        service.createVersion(tx as any, 'tenant-1', 'wf-1', {
          states: [
            { name: 'Started', isInitial: true },
            { name: 'Started2', isInitial: true },
          ],
          transitions: [],
        } as any),
      ).rejects.toBeInstanceOf(WorkflowInvalidStateError);
    });

    it('rejects a transition referencing an unknown state', async () => {
      const { tx } = baseTx();

      await expect(
        service.createVersion(tx as any, 'tenant-1', 'wf-1', {
          states: [{ name: 'Started', isInitial: true }],
          transitions: [{ fromStateName: 'Started', toStateName: 'Missing' }],
        } as any),
      ).rejects.toBeInstanceOf(WorkflowInvalidStateError);
    });

    it('rejects when the workflow is not in the tenant', async () => {
      const tx = {
        workflow: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createVersion(tx as any, 'tenant-1', 'wf-foreign', {
          states: [{ name: 'Started', isInitial: true }],
          transitions: [],
        } as any),
      ).rejects.toBeInstanceOf(WorkflowNotFoundError);
    });
  });

  describe('publishVersion', () => {
    it('publishes a draft version and retires already-published ones', async () => {
      const tx = {
        workflowVersion: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ver-1',
            tenantId: 'tenant-1',
            status: 'DRAFT',
            workflowId: 'wf-1',
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({
            id: 'ver-1',
            status: 'PUBLISHED',
          }),
        },
      } as any;

      const result = await service.publishVersion(
        tx as any,
        'tenant-1',
        'ver-1',
      );
      expect(result.status).toBe('PUBLISHED');
      expect(tx.workflowVersion.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          workflowId: 'wf-1',
          status: 'PUBLISHED',
        }),
        data: expect.objectContaining({ status: 'RETIRED' }),
      });
    });

    it('rejects publishing a non-draft version', async () => {
      const tx = {
        workflowVersion: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'ver-1',
            tenantId: 'tenant-1',
            status: 'PUBLISHED',
            workflowId: 'wf-1',
          }),
        },
      } as any;

      await expect(
        service.publishVersion(tx as any, 'tenant-1', 'ver-1'),
      ).rejects.toBeInstanceOf(WorkflowInvalidStateError);
    });
  });
});
