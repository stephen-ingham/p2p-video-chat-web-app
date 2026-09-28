#!/usr/bin/env node

// Auto-detects the host OS and runs the matching .ps1 (Windows) or .sh
// (everything else) script from this directory, forwarding any extra args.

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const [scriptName, ...extraArgs] = process.argv.slice(2);

if (!scriptName) {
	console.error('Usage: node scripts/dispatch.mjs <script-name> [args...]');
	process.exit(1);
}

const isWindows = process.platform === 'win32';

const command = isWindows ? 'powershell' : 'bash';
const args = isWindows
	? [
			'-NoProfile',
			'-ExecutionPolicy',
			'Bypass',
			'-File',
			path.join(dirname, `${scriptName}.ps1`),
			...extraArgs,
		]
	: [path.join(dirname, `${scriptName}.sh`), ...extraArgs];

const result = spawnSync(command, args, {stdio: 'inherit'});

if (result.error) {
	console.error(result.error);
	process.exit(1);
}

process.exit(result.status ?? 1);
