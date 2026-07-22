import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildKeyDiscoveryPipeline,
  buildCustomFieldContextText,
  buildServerInstructions,
  getCustomFieldContext,
  clearCustomFieldContextCache,
  MAX_KEYS_PER_TYPE,
} from '../../src/custom-field-context.js';

type Row = { _id: { key: string; componentType: string }; count: number };

const ROWS: Row[] = [
  { _id: { key: 'Tipo De Fondos', componentType: 'project' }, count: 215 },
  { _id: { key: 'COD_FINANZAS', componentType: 'project' }, count: 215 },
  { _id: { key: 'Presupuesto_Original', componentType: 'project' }, count: 101 },
  { _id: { key: 'servicios campo', componentType: 'service' }, count: 7 },
];

describe('buildKeyDiscoveryPipeline', () => {
  it('uses only DataMart-whitelisted stages and ends with $limit', () => {
    const pipeline = buildKeyDiscoveryPipeline();
    const stages = pipeline.map((s) => Object.keys(s)[0]);
    for (const stage of stages) {
      expect(['$project', '$unwind', '$group', '$sort', '$limit']).toContain(stage);
    }
    expect(stages[stages.length - 1]).toBe('$limit');
  });

  it('extracts customFields keys via $objectToArray', () => {
    expect(JSON.stringify(buildKeyDiscoveryPipeline())).toContain('$objectToArray');
  });
});

describe('buildCustomFieldContextText', () => {
  it('returns undefined for empty or missing rows', () => {
    expect(buildCustomFieldContextText([])).toBeUndefined();
    expect(buildCustomFieldContextText(undefined as unknown as Row[])).toBeUndefined();
  });

  it('groups keys by component type with document counts', () => {
    const text = buildCustomFieldContextText(ROWS)!;
    expect(text).toContain('project: "Tipo De Fondos" (215), "COD_FINANZAS" (215), "Presupuesto_Original" (101)');
    expect(text).toContain('service: "servicios campo" (7)');
  });

  it('explains how to query customFields via query_datamart', () => {
    const text = buildCustomFieldContextText(ROWS)!;
    expect(text).toContain('customFields');
    expect(text).toContain('query_datamart');
    expect(text).toContain('case-');
  });

  it('warns about dotted keys only when present', () => {
    const withoutDots = buildCustomFieldContextText(ROWS)!;
    expect(withoutDots).not.toContain('$getField');

    const withDots = buildCustomFieldContextText([
      ...ROWS,
      { _id: { key: 'SERV. ONESHOT BRL', componentType: 'project' }, count: 130 },
    ])!;
    expect(withDots).toContain('"SERV. ONESHOT BRL"');
    expect(withDots).toContain('$getField');
  });

  it('caps the number of keys per component type', () => {
    const many: Row[] = Array.from({ length: MAX_KEYS_PER_TYPE + 5 }, (_, i) => ({
      _id: { key: `Field ${i}`, componentType: 'project' },
      count: 100 - i,
    }));
    const text = buildCustomFieldContextText(many)!;
    expect(text).toContain(`and 5 more`);
    expect(text).not.toContain(`"Field ${MAX_KEYS_PER_TYPE}"`);
  });

  it('sorts keys by count descending within a type', () => {
    const text = buildCustomFieldContextText([
      { _id: { key: 'Rare', componentType: 'project' }, count: 2 },
      { _id: { key: 'Common', componentType: 'project' }, count: 99 },
    ])!;
    expect(text.indexOf('"Common"')).toBeLessThan(text.indexOf('"Rare"'));
  });
});

describe('buildServerInstructions', () => {
  it('wraps the context block for the MCP initialize instructions', () => {
    const instructions = buildServerInstructions('CONTEXT-BLOCK');
    expect(instructions).toContain('CONTEXT-BLOCK');
    expect(instructions).toContain('ITM Platform');
  });
});

describe('getCustomFieldContext', () => {
  const log = { warn: vi.fn(), debug: vi.fn() } as any;

  function fakeClients(rows: Row[] | Promise<Row[]>) {
    return {
      datamart: {
        query: vi.fn(async () => ({ aggregateComponents: await rows })),
      },
    } as any;
  }

  beforeEach(() => {
    clearCustomFieldContextCache();
    delete process.env.ITM_CUSTOM_FIELD_CONTEXT;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches, builds, and caches the context per company', async () => {
    const clients = fakeClients(ROWS);
    const first = await getCustomFieldContext('ucloud', clients, log);
    const second = await getCustomFieldContext('ucloud', clients, log);
    expect(first).toContain('Tipo De Fondos');
    expect(second).toBe(first);
    expect(clients.datamart.query).toHaveBeenCalledTimes(1);
  });

  it('keeps caches separate per company', async () => {
    const clients = fakeClients(ROWS);
    await getCustomFieldContext('ucloud', clients, log);
    await getCustomFieldContext('other', clients, log);
    expect(clients.datamart.query).toHaveBeenCalledTimes(2);
  });

  it('expires the cache after the TTL', async () => {
    vi.useFakeTimers();
    const clients = fakeClients(ROWS);
    await getCustomFieldContext('ucloud', clients, log);
    vi.advanceTimersByTime(11 * 60 * 1000);
    await getCustomFieldContext('ucloud', clients, log);
    expect(clients.datamart.query).toHaveBeenCalledTimes(2);
  });

  it('returns undefined and caches it when the account has no custom fields', async () => {
    const clients = fakeClients([]);
    expect(await getCustomFieldContext('empty', clients, log)).toBeUndefined();
    expect(await getCustomFieldContext('empty', clients, log)).toBeUndefined();
    expect(clients.datamart.query).toHaveBeenCalledTimes(1);
  });

  it('returns undefined on DataMart errors without throwing', async () => {
    const clients = { datamart: { query: vi.fn().mockRejectedValue(new Error('boom')) } } as any;
    expect(await getCustomFieldContext('broken', clients, log)).toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('gives up after the timeout but lets the fetch populate the cache later', async () => {
    vi.useFakeTimers();
    let resolveRows!: (rows: Row[]) => void;
    const slow = new Promise<Row[]>((res) => { resolveRows = res; });
    const clients = fakeClients(slow);

    const racing = getCustomFieldContext('slow', clients, log);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await racing).toBeUndefined();

    resolveRows(ROWS);
    await vi.advanceTimersByTimeAsync(0);
    const cached = await getCustomFieldContext('slow', clients, log);
    expect(cached).toContain('Tipo De Fondos');
    expect(clients.datamart.query).toHaveBeenCalledTimes(1);
  });

  it('is disabled by ITM_CUSTOM_FIELD_CONTEXT=off', async () => {
    process.env.ITM_CUSTOM_FIELD_CONTEXT = 'off';
    const clients = fakeClients(ROWS);
    expect(await getCustomFieldContext('ucloud', clients, log)).toBeUndefined();
    expect(clients.datamart.query).not.toHaveBeenCalled();
  });
});
