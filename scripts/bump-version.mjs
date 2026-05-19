#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commitMsgPath = process.argv[2];

if (!commitMsgPath) {
  console.error('usage: scripts/bump-version.mjs <commit-msg-file>');
  process.exit(1);
}

const versionPaths = new Set([
  'README.md',
  'esp-server/VERSION',
  'esp-ui/package.json',
  'firmware/esp32-jgb37-drv8871-motor-controller/src/main.cpp',
]);

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

function gitText(...args) {
  const result = git(...args);
  return result.status === 0 ? result.stdout : '';
}

const commitMessage = readFileSync(commitMsgPath, 'utf8');
const subject = commitMessage
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line && !line.startsWith('#')) ?? '';

if (!subject || subject.startsWith('Merge ') || subject.startsWith('Revert ')) {
  process.exit(0);
}

const stagedPaths = gitText('diff', '--cached', '--name-only')
  .split('\n')
  .filter(Boolean);
const nonVersionChanges = stagedPaths.filter((path) => !versionPaths.has(path));
const stagedCanonicalVersionChange = stagedPaths.includes('esp-server/VERSION');

if (nonVersionChanges.length === 0 || stagedCanonicalVersionChange) {
  process.exit(0);
}

function bumpKind(message) {
  if (/BREAKING CHANGE:/m.test(message) || /^[a-z]+(?:\([^)]+\))?!:/.test(subject)) return 'major';
  if (/^feat(?:\([^)]+\))?:/.test(subject)) return 'minor';
  return 'patch';
}

function bumpVersion(version, kind) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`invalid semver: ${version}`);
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (kind === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function readHeadVersion() {
  const fromHead = gitText('show', 'HEAD:esp-server/VERSION').trim();
  if (fromHead) return fromHead;
  return readFileSync(join(root, 'esp-server/VERSION'), 'utf8').trim();
}

function readStagedVersion() {
  const fromIndex = gitText('show', ':esp-server/VERSION').trim();
  if (fromIndex) return fromIndex;
  return readFileSync(join(root, 'esp-server/VERSION'), 'utf8').trim();
}

const oldVersion = readHeadVersion();
const nextVersion = bumpVersion(oldVersion, bumpKind(commitMessage));
const stagedVersion = readStagedVersion();

if (stagedVersion === nextVersion) {
  process.exit(0);
}

const versionFile = join(root, 'esp-server/VERSION');
writeFileSync(versionFile, `${nextVersion}\n`);

const packageFile = join(root, 'esp-ui/package.json');
if (existsSync(packageFile)) {
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  pkg.version = nextVersion;
  writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
}

const readmeFile = join(root, 'README.md');
if (existsSync(readmeFile)) {
  let readme = readFileSync(readmeFile, 'utf8');
  readme = readme
    .replace(/version-[0-9]+\.[0-9]+\.[0-9]+-blue/g, `version-${nextVersion}-blue`)
    .replace(/releases\/tag\/v[0-9]+\.[0-9]+\.[0-9]+/g, `releases/tag/v${nextVersion}`)
    .replace(/\*\*((?:當前|当前)版本：)v[0-9]+\.[0-9]+\.[0-9]+\*\*/g, `**$1v${nextVersion}**`);
  writeFileSync(readmeFile, readme);
}

const motorMainFile = join(root, 'firmware/esp32-jgb37-drv8871-motor-controller/src/main.cpp');
if (existsSync(motorMainFile)) {
  let main = readFileSync(motorMainFile, 'utf8');
  main = main
    .replace(/Version: [0-9]+\.[0-9]+\.[0-9]+/g, `Version: ${nextVersion}`)
    .replace(/ESP32 Motor Controller v[0-9]+\.[0-9]+\.[0-9]+/g, `ESP32 Motor Controller v${nextVersion}`);
  writeFileSync(motorMainFile, main);
}

const add = git('add', ...versionPaths);
if (add.status !== 0) {
  process.stderr.write(add.stderr);
  process.exit(add.status ?? 1);
}

console.error(`semantic version: ${oldVersion} -> ${nextVersion}`);
console.error('Version files were updated and staged. Re-run the same git commit command.');
process.exit(1);
