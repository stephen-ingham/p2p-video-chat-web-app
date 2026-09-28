// Removes the buildx builder that `@pulumi/docker-build` leaves behind.
// The provider can't use Docker's default `docker` driver, so when no
// builder is given it creates a `docker-container` one (a running
// moby/buildkit container) and never removes it. Builders that existed
// before the command ran are left alone.
//
//   node scripts/buildx-cleanup.mjs <command> [args]   run it, then clean up
//
// gcp-e2e.mjs imports withBuildxCleanup instead.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const shell = process.platform === 'win32';

// Names of the docker-container builders. Empty if Docker isn't available.
function containerBuilders() {
	const result = spawnSync('docker', ['buildx', 'ls', '--format', 'json'], {
		encoding: 'utf8',
		shell,
	});
	if (result.status !== 0) return new Set();
	return new Set(
		result.stdout
			.split('\n')
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line))
			.filter((builder) => builder.Driver === 'docker-container')
			.map((builder) => builder.Name),
	);
}

// Runs `callback`, then removes any docker-container builder it created,
// whether it succeeded or not. Returns what `callback` returns.
export async function withBuildxCleanup(callback) {
	const before = containerBuilders();
	try {
		return await callback();
	} finally {
		for (const name of containerBuilders()) {
			if (before.has(name)) continue;
			console.log(`Removing buildx builder ${name} left by docker-build.`);
			spawnSync('docker', ['buildx', 'rm', '--force', name], {
				stdio: 'inherit',
				shell,
			});
		}
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [file, ...args] = process.argv.slice(2);
	if (!file) {
		throw new Error(
			`Usage: node ${path.relative(process.cwd(), process.argv[1])} <command> [args]`,
		);
	}

	// Ctrl+C reaches the command and stops it, but not this process, so the
	// cleanup still runs.
	process.on('SIGINT', () => {
		console.log('Interrupted: cleaning up once the command stops.');
	});
	process.exitCode = await withBuildxCleanup(() => {
		const result = spawnSync(file, args, {stdio: 'inherit', shell});
		if (result.error) throw result.error;
		return result.status ?? 1;
	});
}
