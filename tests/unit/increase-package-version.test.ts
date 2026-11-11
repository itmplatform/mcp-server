import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts', 'increase-package-version.mjs');

describe('increase-package-version.mjs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `mcp-version-test-${Date.now()}`);
    mkdirSync(join(tempDir, 'scripts'), { recursive: true });
    copyFileSync(SCRIPT, join(tempDir, 'scripts', 'increase-package-version.mjs'));
    writeJson('package.json', { name: '@itm-platform/mcp-server', version: '1.0.22' });
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  function writeJson(file: string, value: unknown) {
    writeFileSync(join(tempDir, file), `${JSON.stringify(value, null, 2)}\n`);
  }

  function readJson(file: string) {
    return JSON.parse(readFileSync(join(tempDir, file), 'utf8'));
  }

  function run() {
    execFileSync('node', [join(tempDir, 'scripts', 'increase-package-version.mjs')], { encoding: 'utf-8' });
  }

  it('increments the patch version in package.json', () => {
    run();
    expect(readJson('package.json').version).toBe('1.0.23');
  });

  it('keeps server.json and its npm package entry on the new package version', () => {
    writeJson('server.json', {
      name: 'io.github.itmplatform/mcp-server',
      version: '1.0.3',
      packages: [{ registryType: 'npm', identifier: '@itm-platform/mcp-server', version: '1.0.3' }],
      remotes: [{ type: 'streamable-http', url: 'https://api.itmplatform.com/v2/_/mcp/' }],
    });

    run();

    const server = readJson('server.json');
    expect(server.version).toBe('1.0.23');
    expect(server.packages[0].version).toBe('1.0.23');
    expect(server.remotes).toEqual([{ type: 'streamable-http', url: 'https://api.itmplatform.com/v2/_/mcp/' }]);
  });

  it('leaves packages from other registries untouched', () => {
    writeJson('server.json', {
      version: '1.0.3',
      packages: [
        { registryType: 'npm', identifier: '@itm-platform/mcp-server', version: '1.0.3' },
        { registryType: 'oci', identifier: 'example/other', version: '9.9.9' },
      ],
    });

    run();

    expect(readJson('server.json').packages[1].version).toBe('9.9.9');
  });

  it('runs without a server.json', () => {
    run();
    expect(existsSync(join(tempDir, 'server.json'))).toBe(false);
  });
});
