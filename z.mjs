#!/usr/bin/env node
import { spawnSync } from 'child_process';
const args = process.argv.slice(2);
const cmd = '/Users/vedant/.nvm/versions/node/v20.20.2/bin/pnpm';
const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  cwd: '/Users/vedant/Documents/projects/ClipFlow',
});
process.exit(result.status ?? 0);
