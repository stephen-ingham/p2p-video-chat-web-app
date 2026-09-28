// Deploys, e2e-tests and destroys an ephemeral GCP stack (see
// infra/Pulumi.dev.yaml). Plain Node rather than a .sh/.ps1 pair, as it only
// shells out to `pulumi` and `npx`.
//
//   node scripts/gcp-e2e.mjs <up|test|down|run> <dev|prod-preview> [playwright args]
//
//   up    pulumi up, non-interactive
//   test  run the e2e suite (not the NAT one) against the deployed stack
//   down  pulumi destroy, non-interactive
//   run   up, test, then down whatever happened
//
// Only the ephemeral stacks are accepted: prod keeps its interactive
// `npm run deploy:prod` / `destroy:prod` (in infra/).
import {spawnSync} from 'node:child_process';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {withBuildxCleanup} from './buildx-cleanup.mjs';

const ephemeralStacks = new Set(['dev', 'prod-preview']);
const [command, stack, ...playwrightArgs] = process.argv.slice(2);

if (
	!['up', 'test', 'down', 'run'].includes(command) ||
	!ephemeralStacks.has(stack)
) {
	throw new Error(
		'Usage: node scripts/gcp-e2e.mjs <up|test|down|run> <dev|prod-preview> [playwright args]',
	);
}

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const infraDir = path.join(repoRoot, 'infra');

// `shell` on Windows only, where npx is a .cmd file.
function run(file, args, options = {}) {
	const result = spawnSync(file, args, {
		stdio: 'inherit',
		shell: process.platform === 'win32',
		...options,
	});
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function pulumi(...args) {
	return run('pulumi', [...args, '--stack', stack, '--non-interactive'], {
		cwd: infraDir,
	});
}

function stackOutputs() {
	const result = spawnSync(
		'pulumi',
		['stack', 'output', '--json', '--stack', stack],
		{cwd: infraDir, encoding: 'utf8', shell: process.platform === 'win32'},
	);
	if (result.status !== 0) {
		throw new Error(`pulumi stack output failed:\n${result.stderr}`);
	}

	return JSON.parse(result.stdout);
}

// Status code of a GET to the app's URL. Undefined if the connection itself
// fails.
async function probe(appUrl, urlPath) {
	return new Promise((resolve) => {
		const request = https.request(
			new URL(urlPath, appUrl),
			{timeout: 15_000},
			(response) => {
				response.resume();
				resolve(response.statusCode);
			},
		);
		request.on('timeout', () => request.destroy());
		request.on('error', () => resolve(undefined));
		request.end();
	});
}

// Both Cloud Run services scale from zero, so wait until the frontend returns
// 200 and the API, through the frontend's proxy, returns 401 (it's up, and
// wants a token) before testing.
async function waitUntilServing(appUrl, timeoutMs = 15 * 60_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		// eslint-disable-next-line no-await-in-loop -- deliberate poll loop
		const [frontend, api] = await Promise.all([
			probe(appUrl, '/'),
			probe(appUrl, '/call/ice-servers'),
		]);
		if (frontend === 200 && api === 401) return;
		if (Date.now() > deadline) {
			throw new Error(
				`${appUrl} not serving yet: frontend ${frontend}, API ${api}`,
			);
		}

		console.log(`Waiting for ${appUrl}: frontend ${frontend}, API ${api}`);
		// eslint-disable-next-line no-await-in-loop -- deliberate poll loop
		await new Promise((resolve) => {
			setTimeout(resolve, 15_000);
		});
	}
}

async function test() {
	const {appUrl, gitSha} = stackOutputs();
	console.log(`Testing ${stack} stack at ${appUrl}, commit ${gitSha}`);
	await waitUntilServing(appUrl);
	return run('npx', ['playwright', 'test', ...playwrightArgs], {
		cwd: repoRoot,
		env: {
			...process.env,
			E2E_BASE_URL: appUrl,
		},
	});
}

// Retried once: a docker-build image push that takes over about a minute
// fails with DeadlineExceeded. Artifact Registry keeps the layers already
// uploaded, and the resources already created are left alone, so the retry
// only finishes the push and whatever the failure stopped. The buildx
// builder docker-build creates is removed afterwards (see buildx-cleanup.mjs).
async function up() {
	return withBuildxCleanup(() => {
		const status = pulumi('up', '--yes', '--skip-preview');
		if (status === 0) return status;
		console.log('pulumi up failed, retrying once.');
		return pulumi('up', '--yes', '--skip-preview');
	});
}

const down = () => pulumi('destroy', '--yes', '--skip-preview');

switch (command) {
	case 'up': {
		process.exitCode = await up();
		break;
	}

	case 'test': {
		process.exitCode = await test();
		break;
	}

	case 'down': {
		process.exitCode = down();
		break;
	}

	case 'run': {
		// Ctrl+C still reaches pulumi/playwright and stops them, but not this
		// process, so the stack is always destroyed afterwards.
		process.on('SIGINT', () => {
			console.log(
				'Interrupted: destroying the stack once the current step stops.',
			);
		});
		let status;
		try {
			status = await up();
			if (status === 0) status = await test();
		} finally {
			const downStatus = down();
			process.exitCode = status || downStatus;
		}

		break;
	}

	default:
}
