import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(repoRoot, 'package.json');
const lockPath = path.join(repoRoot, 'package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const packageJson = readJson(packagePath);
const oldVersion = packageJson.version;
const newVersion = oldVersion.replace(/(\d+)$/, value => String(Number(value) + 1));

if (newVersion === oldVersion) {
  throw new Error(`Could not increment package version: ${oldVersion}`);
}

packageJson.version = newVersion;
writeJson(packagePath, packageJson);

if (fs.existsSync(lockPath)) {
  const lockJson = readJson(lockPath);
  lockJson.name = packageJson.name;
  lockJson.version = newVersion;
  if (lockJson.packages?.['']) {
    lockJson.packages[''].name = packageJson.name;
    lockJson.packages[''].version = newVersion;
  }
  writeJson(lockPath, lockJson);
}

console.log('New version is', newVersion);
