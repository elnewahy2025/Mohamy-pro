import { TaskService } from './task.service';
import {
  TaskAccessDeniedError,
  TaskInvalidStateError,
  TaskNotFoundError,
} from './task.errors';

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    service = new TaskService();
  });

  describe('createTask', () => {
    it('creates a task in the tenant when related entities are visible', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        task: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'task-1' }),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
        },
      } as any;

      const created = await service.createTask(
        tx as any,
        'tenant-1',
        'reporter-1',
        {
          caseId: 'case-1',
          title: 'Draft motion',
          assignedUserId: 'member-1',
        } as any,
      );

      expect(created).toEqual({ id: 'task-1' });
      expect(tx.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          caseId: 'case-1',
        }),
      });
    });

    it('rejects a task whose case is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createTask(tx as any, 'tenant-1', 'reporter-1', {
          caseId: 'case-foreign',
          title: 'X',
        } as any),
      ).rejects.toBeInstanceOf(TaskAccessDeniedError);
    });

    it('rejects when the parent task is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        task: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createTask(tx as any, 'tenant-1', 'reporter-1', {
          caseId: 'case-1',
          parentTaskId: 'task-foreign',
          title: 'X',
        } as any),
      ).rejects.toBeInstanceOf(TaskAccessDeniedError);
    });
  });

  describe('assignTask', () => {
    it('assigns a task to a visible membership', async () => {
      const tx = {
        task: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'task-1', status: 'TODO' }),
          update: jest.fn().mockResolvedValue({
            id: 'task-1',
            assignedUserId: 'member-1',
          }),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
        },
      } as any;

      const result = await service.assignTask(tx as any, 'tenant-1', 'task-1', {
        assignedUserId: 'member-1',
      } as any);

      expect(result.assignedUserId).toBe('member-1');
    });

    it('rejects assigning to a membership outside the tenant', async () => {
      const tx = {
        task: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'task-1', status: 'TODO' }),
        },
        membership: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.assignTask(tx as any, 'tenant-1', 'task-1', {
          assignedUserId: 'member-foreign',
        } as any),
      ).rejects.toBeInstanceOf(TaskAccessDeniedError);
    });
  });

  describe('updateTaskStatus', () => {
    it('completes a task with no incomplete prerequisites', async () => {
      const tx = {
        task: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'task-1',
            status: 'IN_PROGRESS',
            dependsOn: [],
          }),
          count: jest.fn().mockResolvedValue(0),
          update: jest
            .fn()
            .mockResolvedValue({ id: 'task-1', status: 'COMPLETED' }),
        },
      } as any;

      const result = await service.updateTaskStatus(
        tx as any,
        'tenant-1',
        'task-1',
        { status: 'COMPLETED' } as any,
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('blocks completing a task with incomplete prerequisites', async () => {
      const tx = {
        task: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'task-1',
            status: 'TODO',
            dependsOn: [{ prerequisiteTaskId: 'prereq-1' }],
          }),
          count: jest.fn().mockResolvedValue(1),
        },
      } as any;

      await expect(
        service.updateTaskStatus(tx as any, 'tenant-1', 'task-1', {
          status: 'COMPLETED',
        } as any),
      ).rejects.toBeInstanceOf(TaskInvalidStateError);
    });

    it('rejects when the task is not in the tenant', async () => {
      const tx = {
        task: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.updateTaskStatus(tx as any, 'tenant-1', 'task-foreign', {
          status: 'COMPLETED',
        } as any),
      ).rejects.toBeInstanceOf(TaskNotFoundError);
    });
  });
});
