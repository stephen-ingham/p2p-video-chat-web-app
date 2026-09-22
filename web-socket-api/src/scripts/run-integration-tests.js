import {spawnSync} from 'node:child_process';
import process from 'node:process';

// Assumes cwd is web-socket-api/src (true when invoked via `npm run test:it`
// from that package.json), matching the relative paths used by test:it.
const composeArgs = [
	'compose',
	'--env-file',
	'../../.env',
	'-f',
	'compose.yaml',
];
const containerName = 'local-mysql';

function runDocker(args) {
	return spawnSync('docker', args, {stdio: 'inherit'}).status ?? 1;
}

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getContainerStatus() {
	const result = spawnSync(
		'docker',
		['inspect', '--format', '{{.State.Status}}', containerName],
		{encoding: 'utf8'},
	);
	return result.status === 0 ? result.stdout.trim() : null;
}

function isHealthy() {
	const result = spawnSync(
		'docker',
		['inspect', '--format', '{{.State.Health.Status}}', containerName],
		{encoding: 'utf8'},
	);
	return result.stdout.trim() === 'healthy';
}

function waitForHealthy(timeoutMs = 60_000, intervalMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (isHealthy()) return true;
		sleep(intervalMs);
	}

	return false;
}

function runTests() {
	const testResult = spawnSync(
		process.execPath,
		[
			'--env-file=../../.env',
			'--import',
			'../tests/it/api/setup.js',
			'--test',
			'--test-concurrency=1',
			'../tests/it/**/*.test.js',
		],
		{stdio: 'inherit'},
	);
	return testResult.status ?? 1;
}

// If mysql-db is already running (e.g. via `npm run dev`), leave it alone —
// other running services depend on it, and we shouldn't stop it out from
// under them. We only start/stop the container we ourselves started.
const alreadyRunning = getContainerStatus() === 'running';
let exitCode = 1;

try {
	if (
		alreadyRunning ||
		runDocker([...composeArgs, 'up', '-d', 'mysql-db']) === 0
	) {
		if (waitForHealthy()) {
			exitCode = runTests();
		} else {
			console.error('mysql-db did not become healthy in time');
		}
	}
} finally {
	if (!alreadyRunning) {
		runDocker([...composeArgs, 'down', 'mysql-db']);
	}
}

process.exitCode = exitCode;
