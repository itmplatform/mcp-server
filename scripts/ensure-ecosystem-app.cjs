// Usage: node scripts/ensure-ecosystem-app.cjs "C:/inetpub/wwwroot/ecosystem.config.js" [MCPProd | MCPStage,MCPDemo]
// Second argument: comma-separated list of app names to manage. If omitted, all MCP apps are processed.

const fs = require('fs');
const path = require('path');

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

try {
  const ecosystemPath = process.argv[2] || path.resolve('..', 'ecosystem.config.js');
  const targetNames = process.argv[3] ? process.argv[3].split(',').map(s => s.trim()) : null;

  if (!fs.existsSync(ecosystemPath)) fail(`Ecosystem file not found at: ${ecosystemPath}`);

  delete require.cache[require.resolve(ecosystemPath)];
  const ec = require(ecosystemPath);

  if (!ec || typeof ec !== 'object') fail('Invalid ecosystem module: not an object');

  const allApps = [
    {
      name: 'MCPProd',
      cwd: 'C:/inetpub/wwwroot/ITM.MCP',
      script: 'dist/server.js',
      interpreter: 'node',
      node_args: ['--env-file=.env'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      min_uptime: '10m',
      max_restarts: 5,
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'MCPStage',
      cwd: 'C:/inetpub/wwwroot/ITM.MCP',
      script: 'dist/server.js',
      interpreter: 'node',
      node_args: ['--env-file=.env.stage'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      min_uptime: '10m',
      max_restarts: 5,
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'MCPDemo',
      cwd: 'C:/inetpub/wwwroot/ITM.MCP',
      script: 'dist/server.js',
      interpreter: 'node',
      node_args: ['--env-file=.env.demo'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      min_uptime: '10m',
      max_restarts: 5,
      exp_backoff_restart_delay: 100,
    }
  ];

  const desiredApps = targetNames
    ? allApps.filter(a => targetNames.includes(a.name))
    : allApps;

  if (targetNames && desiredApps.length === 0) {
    fail(`No matching app definitions found for: ${targetNames.join(', ')}`);
  }

  console.log(`Managing apps: ${desiredApps.map(a => a.name).join(', ')}`);

  ec.apps ||= [];
  if (!Array.isArray(ec.apps)) fail('Invalid ecosystem: "apps" is not an array');

  let added = 0;
  let updated = 0;

  for (const desired of desiredApps) {
    const idx = ec.apps.findIndex(a => a && a.name === desired.name);

    if (idx === -1) {
      ec.apps.push(desired);
      added++;
      console.log(`Added ${desired.name} to ecosystem.`);
    } else {
      ec.apps[idx] = { ...ec.apps[idx], ...desired };
      updated++;
      console.log(`Updated ${desired.name} entry in ecosystem.`);
    }
  }

  const backup = `${ecosystemPath}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  fs.copyFileSync(ecosystemPath, backup);
  fs.writeFileSync(ecosystemPath, 'module.exports = ' + JSON.stringify(ec, null, 2) + ';\n');

  delete require.cache[require.resolve(ecosystemPath)];
  const check = require(ecosystemPath);
  const ok = Array.isArray(check.apps) &&
             desiredApps.every(desired => check.apps.some(a => a?.name === desired.name));

  if (!ok) fail(`Post-write validation failed: not all expected apps present in ecosystem (${desiredApps.map(a => a.name).join(', ')}).`);

  console.log(`Ecosystem updated OK. Added: ${added}, Updated: ${updated}. Backup at: ${backup}`);
} catch (err) {
  fail(`ensure-ecosystem-app failed: ${err && err.stack || err}`);
}
