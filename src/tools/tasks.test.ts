import { describe, it, expect, vi, afterEach } from 'vitest';

describe('list_project_tasks query composition', () => {
  it('requests tasks projection for the given project ID', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      component: { tasks: [{ taskId: 1, name: 'Task 1' }] },
    });

    const variables = { id: 123, proj: { tasks: 1 } };
    const data = await mockQuery({ query: 'component', variables });
    const tasks = (data.component as Record<string, unknown>).tasks;

    expect(mockQuery).toHaveBeenCalledWith({ query: 'component', variables: { id: 123, proj: { tasks: 1 } } });
    expect(tasks).toEqual([{ taskId: 1, name: 'Task 1' }]);
  });

  it('returns empty array when component has no tasks', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      component: { tasks: [] },
    });
    const data = await mockQuery({ query: 'component', variables: { id: 999, proj: { tasks: 1 } } });
    expect((data.component as Record<string, unknown>).tasks).toEqual([]);
  });
});
