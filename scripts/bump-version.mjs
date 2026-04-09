#!/usr/bin/env node

/**
 * Bump version for all packages in the monorepo.
 *
 * Usage: node scripts/bump-version.mjs <patch|minor|major>
 *
 * - Reads current version from the first package
 * - Bumps all packages to the same new version
 * - Updates inter-package workspace:* dependencies to the exact new version
 *   so pnpm publish resolves them correctly
 * - Prints the new version to stdout (last line)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGES_DIR = join(ROOT, 'packages');

function getPackageDirs() {
  return readdirSync(PACKAGES_DIR)
    .map((d) => join(PACKAGES_DIR, d))
    .filter((d) => statSync(d).isDirectory());
}

function readPkg(dir) {
  const path = join(dir, 'package.json');
  return { path, pkg: JSON.parse(readFileSync(path, 'utf8')) };
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }
}

const type = process.argv[2];
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Usage: bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

const dirs = getPackageDirs();
const packages = dirs.map(readPkg);

// All packages share the same version — read from first
const currentVersion = packages[0].pkg.version;
const newVersion = bumpVersion(currentVersion, type);

// Collect all @kavri/* package names
const kavriNames = new Set(packages.map(({ pkg }) => pkg.name));

for (const { path, pkg } of packages) {
  pkg.version = newVersion;

  // Update inter-package deps from workspace:* to exact version
  for (const depField of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[depField];
    if (!deps) continue;
    for (const [name, version] of Object.entries(deps)) {
      if (kavriNames.has(name) && version.startsWith('workspace:')) {
        deps[name] = `workspace:^${newVersion}`;
      }
    }
  }

  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
}

// Print new version as last line (consumed by CI)
console.log(newVersion);
