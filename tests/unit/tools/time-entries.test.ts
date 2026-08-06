import { describe, it, expect, vi } from 'vitest';
import {
  formatReportedHours,
  parseReportedHours,
  findReportedMinutes,
  registerTimeEntryTools,
} from '../../../src/tools/time-entries.js';
import type { EffectiveUserContext } from '../../../src/auth/effective-user-context.js';

function createFakeServer() {
  const tools = new Map<string, { config: unknown; cb: (args: Record<string, unknown>) => Promise<any> }>();
  const server = {
    registerTool: (name: string, config: unknown, cb: (args: Record<string, unknown>) => Promise<any>) => {
      tools.set(name, { config, cb });
    },
  };
  return { server: server as any, tools };
}

function createFakeClients() {
  return {
    restV1: {
      get: vi.fn(),
      post: vi.fn(),
    },
  } as any;
}

function makeContext(overrides: Partial<EffectiveUserContext> = {}): EffectiveUserContext {
  return {
    source: 'token',
    company: 'acme',
    accountId: 1,
    userId: 42,
    languageId: 1,
    email: 'pmo@acme.com',
    licenseTypeIds: [1],
    dataMartAccess: 'full',
    authHeaders: { Token: 't' },
    grantedScopes: ['mcp:read', 'mcp:write'],
    ...overrides,
  };
}

function timesheet(projectId: number, taskId: number, date: string, reportedHours: string) {
  return {
    TimeReports: [{
      EntityId: projectId,
      Name: 'Project',
      WorkItems: [{
        WorkItemId: taskId,
        Name: 'Task',
        TimeEntries: [{ Date: date, ReportedHours: reportedHours }],
      }],
    }],
  };
}

const TODAY = new Date().toISOString().slice(0, 10);

describe('parseReportedHours', () => {
  it('parses H:MM strings to minutes', () => {
    expect(parseReportedHours('2:30')).toBe(150);
    expect(parseReportedHours('0:00')).toBe(0);
    expect(parseReportedHours('24:00')).toBe(1440);
    expect(parseReportedHours('1:05')).toBe(65);
  });

  it('treats empty and missing values as zero', () => {
    expect(parseReportedHours('')).toBe(0);
    expect(parseReportedHours(null)).toBe(0);
    expect(parseReportedHours(undefined)).toBe(0);
  });

  it('throws on unparseable values', () => {
    expect(() => parseReportedHours('abc')).toThrow();
  });
});

describe('formatReportedHours', () => {
  it('formats minutes as H:MM', () => {
    expect(formatReportedHours(150)).toBe('2:30');
    expect(formatReportedHours(0)).toBe('0:00');
    expect(formatReportedHours(65)).toBe('1:05');
    expect(formatReportedHours(1440)).toBe('24:00');
  });
});

describe('findReportedMinutes', () => {
  it('finds the entry for project + task + date', () => {
    expect(findReportedMinutes(timesheet(100, 200, TODAY, '1:30'), 100, 200, TODAY)).toBe(90);
  });

  it('returns 0 when the timesheet, project, task, or date is missing', () => {
    expect(findReportedMinutes(null, 100, 200, TODAY)).toBe(0);
    expect(findReportedMinutes({}, 100, 200, TODAY)).toBe(0);
    expect(findReportedMinutes(timesheet(999, 200, TODAY, '1:30'), 100, 200, TODAY)).toBe(0);
    expect(findReportedMinutes(timesheet(100, 999, TODAY, '1:30'), 100, 200, TODAY)).toBe(0);
    expect(findReportedMinutes(timesheet(100, 200, '2020-01-01', '1:30'), 100, 200, TODAY)).toBe(0);
  });

  it('tolerates date values that carry a time part', () => {
    const sheet = timesheet(100, 200, `${TODAY}T00:00:00`, '2:00');
    expect(findReportedMinutes(sheet, 100, 200, TODAY)).toBe(120);
  });
});

describe('log_time_entry', () => {
  async function setup(ctx = makeContext()) {
    const { server, tools } = createFakeServer();
    const clients = createFakeClients();
    registerTimeEntryTools(server, clients, ctx);
    return { tools, clients };
  }

  it('is not registered without the write scope', async () => {
    const { server, tools } = createFakeServer();
    registerTimeEntryTools(server, createFakeClients(), makeContext({ grantedScopes: ['mcp:read'] }));
    expect(tools.has('log_time_entry')).toBe(false);
  });

  it('set mode: reads first, posts the requested total, and echoes both totals', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '1:00'))
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '2:30'));
    clients.restV1.post.mockResolvedValue({ StatusCode: 200, StatusMessage: 'Time entries done successfully.' });

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 2, minutes: 30, mode: 'set', comment: 'handover work',
    });

    expect(clients.restV1.get).toHaveBeenNthCalledWith(1, `timehours?startdate=${TODAY}&enddate=${TODAY}&teammember=42`);
    expect(clients.restV1.post).toHaveBeenCalledWith('timehours', {
      UserId: 42,
      TimeReports: [{
        EntityId: 100,
        WorkItemId: 200,
        Date: TODAY,
        ReportedHours: '2:30',
        UserComment: 'handover work',
      }],
    });
    const text = result.content[0].text;
    expect(text).toContain('"previousTotal": "1:00"');
    expect(text).toContain('"newTotal": "2:30"');
    expect(result.isError).toBeUndefined();
  });

  it('add mode: adds the logged time to the existing total', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '1:00'))
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '2:30'));
    clients.restV1.post.mockResolvedValue({ StatusCode: 200 });

    await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 1, minutes: 30, mode: 'add',
    });

    const posted = clients.restV1.post.mock.calls[0][1];
    expect(posted.TimeReports[0].ReportedHours).toBe('2:30');
    expect(posted.TimeReports[0].UserComment).toBeUndefined();
  });

  it('treats a 204 empty timesheet as zero previous hours', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '3:00'));
    clients.restV1.post.mockResolvedValue({ StatusCode: 200 });

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 3, minutes: 0, mode: 'add',
    });

    expect(result.content[0].text).toContain('"previousTotal": "0:00"');
    expect(result.content[0].text).toContain('"newTotal": "3:00"');
  });

  it('logs on behalf of another user when the caller has a full-access license', async () => {
    const { tools, clients } = await setup(makeContext({ licenseTypeIds: [1] }));
    clients.restV1.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '2:00'));
    clients.restV1.post.mockResolvedValue({ StatusCode: 200 });

    await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 2, minutes: 0, mode: 'set', userId: 77,
    });

    expect(clients.restV1.get).toHaveBeenNthCalledWith(1, `timehours?startdate=${TODAY}&enddate=${TODAY}&teammember=77`);
    expect(clients.restV1.post.mock.calls[0][1].UserId).toBe(77);
  });

  it('rejects on-behalf logging for a Project Manager license before any REST call', async () => {
    const { tools, clients } = await setup(makeContext({ licenseTypeIds: [2], dataMartAccess: 'pm-scoped' }));

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 2, minutes: 0, mode: 'set', userId: 77,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Company Admin or Full Access/);
    expect(clients.restV1.get).not.toHaveBeenCalled();
    expect(clients.restV1.post).not.toHaveBeenCalled();
  });

  it('rejects future dates', async () => {
    const { tools, clients } = await setup();

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: '2999-01-01', hours: 1, minutes: 0, mode: 'set',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/future/i);
    expect(clients.restV1.post).not.toHaveBeenCalled();
  });

  it('rejects malformed dates', async () => {
    const { tools } = await setup();
    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: '06/08/2026', hours: 1, minutes: 0, mode: 'set',
    });
    expect(result.isError).toBe(true);
  });

  it('rejects an add that would exceed 24 hours in one day', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get.mockResolvedValueOnce(timesheet(100, 200, TODAY, '23:00'));

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 2, minutes: 0, mode: 'add',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/24/);
    expect(clients.restV1.post).not.toHaveBeenCalled();
  });

  it('surfaces per-row REST errors such as unassigned users', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get.mockResolvedValueOnce(null);
    clients.restV1.post.mockResolvedValue({
      StatusCode: 400,
      Errors: [{ EntityId: 100, WorkItemId: 200, Message: 'User not assigned to the work item' }],
    });

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 1, minutes: 0, mode: 'set',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('User not assigned to the work item');
  });

  it('verifies the readback total and throws on mismatch', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '1:00'))
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '1:00'));
    clients.restV1.post.mockResolvedValue({ StatusCode: 200 });

    await expect(tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 2, minutes: 0, mode: 'set',
    })).rejects.toThrow(/verification/i);
  });

  it('accepts a set to 0:00 whose entry disappears from the readback', async () => {
    const { tools, clients } = await setup();
    clients.restV1.get
      .mockResolvedValueOnce(timesheet(100, 200, TODAY, '2:00'))
      .mockResolvedValueOnce(null);
    clients.restV1.post.mockResolvedValue({ StatusCode: 200 });

    const result = await tools.get('log_time_entry')!.cb({
      projectId: 100, taskId: 200, date: TODAY, hours: 0, minutes: 0, mode: 'set',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('"newTotal": "0:00"');
  });
});
