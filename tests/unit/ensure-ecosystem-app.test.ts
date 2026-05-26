import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts', 'ensure-ecosystem-app.cjs');

describe('ensure-ecosystem-app.cjs', () => {
  let tempDir: string;
  let ecoPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `mcp-eco-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    ecoPath = join(tempDir, 'ecosystem.config.js');
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  function readEcosystem() {
    delete require.cache[ecoPath];
    return require(ecoPath);
  }

  it('adds MCPProd app to an empty ecosystem', () => {
    writeFileSync(ecoPath, 'module.exports = { apps: [] };\n');
    execFileSync('node', [SCRIPT, ecoPath, 'MCPProd'], { encoding: 'utf-8' });

    const eco = readEcosystem();
    expect(eco.apps).toHaveLength(1);
    expect(eco.apps[0].name).toBe('MCPProd');
    expect(eco.apps[0].cwd).toBe('C:/inetpub/wwwroot/ITM.MCP');
    expect(eco.apps[0].script).toBe('dist/server.js');
  });

  it('adds MCPStage and MCPDemo apps together', () => {
    writeFileSync(ecoPath, 'module.exports = { apps: [] };\n');
    execFileSync('node', [SCRIPT, ecoPath, 'MCPStage,MCPDemo'], { encoding: 'utf-8' });

    const eco = readEcosystem();
    expect(eco.apps).toHaveLength(2);
    expect(eco.apps.map((a: any) => a.name)).toEqual(['MCPStage', 'MCPDemo']);
  });

  it('updates existing app without duplicating', () => {
    writeFileSync(ecoPath, `module.exports = { apps: [{ name: 'MCPProd', script: 'old.js' }] };\n`);
    execFileSync('node', [SCRIPT, ecoPath, 'MCPProd'], { encoding: 'utf-8' });

    const eco = readEcosystem();
    expect(eco.apps).toHaveLength(1);
    expect(eco.apps[0].script).toBe('dist/server.js');
  });

  it('preserves other apps in the ecosystem', () => {
    writeFileSync(ecoPath, `module.exports = { apps: [{ name: 'MSTeamBot', script: 'bot.js' }] };\n`);
    execFileSync('node', [SCRIPT, ecoPath, 'MCPProd'], { encoding: 'utf-8' });

    const eco = readEcosystem();
    expect(eco.apps).toHaveLength(2);
    expect(eco.apps.map((a: any) => a.name)).toContain('MSTeamBot');
    expect(eco.apps.map((a: any) => a.name)).toContain('MCPProd');
  });

  it('sets correct node_args per app name', () => {
    writeFileSync(ecoPath, 'module.exports = { apps: [] };\n');
    execFileSync('node', [SCRIPT, ecoPath, 'MCPProd,MCPStage,MCPDemo'], { encoding: 'utf-8' });

    const eco = readEcosystem();
    const prod = eco.apps.find((a: any) => a.name === 'MCPProd');
    const stage = eco.apps.find((a: any) => a.name === 'MCPStage');
    const demo = eco.apps.find((a: any) => a.name === 'MCPDemo');

    expect(prod.node_args).toContain('--env-file=.env');
    expect(stage.node_args).toContain('--env-file=.env.stage');
    expect(demo.node_args).toContain('--env-file=.env.demo');
  });

  it('creates a backup file', () => {
    writeFileSync(ecoPath, 'module.exports = { apps: [] };\n');
    execFileSync('node', [SCRIPT, ecoPath, 'MCPProd'], { encoding: 'utf-8' });

    const files = readdirSync(tempDir);
    const backups = files.filter((f: string) => f.includes('.bak'));
    expect(backups.length).toBeGreaterThan(0);
  });

  it('exits with error for nonexistent ecosystem file', () => {
    expect(() => {
      execFileSync('node', [SCRIPT, join(tempDir, 'nonexistent.js'), 'MCPProd'], { encoding: 'utf-8' });
    }).toThrow();
  });
});
