// Prepares a deployed stack and a CI-style release APK for the Maestro flows,
// for `npm run test:e2e:remote` in mobile-app/ (test-maestro.ps1/.sh
// --remote, which install and run it). Plain Node, as it's the same on every
// OS. It does what .github/actions/maestro-e2e and the GCP jobs before it do:
//
//   node scripts/e2e-apk.mjs <abi>
//
//   1. reads the stack's URL from MOBILE_E2E_APP_URL (the shell environment,
//      else the root .env), e.g. a GCP stack's `appUrl` output
//   2. waits for it to serve the API, then signs up the user the flows log in
//      as (GCP stacks run with NODE_ENV=production, so nobody is seeded)
//   3. builds a release APK with the app's JS bundled in (no Metro), pointed
//      at that URL, for the device's ABI only (CI builds every ABI). The APK
//      is kept in mobile-app/maestro-output/e2e-apk/ and reused while the URL,
//      ABI and app source are unchanged, as CI's cache is.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const appDir = path.join(repoRoot, 'mobile-app');
const outDir = path.join(appDir, 'maestro-output', 'e2e-apk');
const apkPath = path.join(outDir, 'app-release.apk');
const stampPath = path.join(outDir, 'build.json');
const isWindows = process.platform === 'win32';
const [abi] = process.argv.slice(2);

function fail(message) {
	throw new Error(`test:e2e:remote: ${message}`);
}

if (!abi) fail('usage: node scripts/e2e-apk.mjs <abi>');

// --- Stack URL ---------------------------------------------------------------

// Just the one key, rather than a .env parser: values there can carry
// trailing `#` comments.
function readEnvFile(key) {
	let text;
	try {
		text = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8');
	} catch {
		return undefined;
	}

	for (const line of text.split(/\r?\n/v)) {
		if (!line.startsWith(`${key}=`)) continue;
		return line
			.slice(key.length + 1)
			.replace(/\s+#.*$/v, '')
			.trim()
			.replaceAll(/^["']|["']$/gv, '');
	}

	return undefined;
}

const appUrl = (
	process.env.MOBILE_E2E_APP_URL ?? readEnvFile('MOBILE_E2E_APP_URL')
)?.replace(/\/+$/v, '');
if (!appUrl) {
	fail(
		"set MOBILE_E2E_APP_URL in the root .env to the deployed stack's URL, e.g. `pulumi stack output appUrl --stack dev` in infra/ after `npm run deploy:dev`.",
	);
}

console.log(`Stack: ${appUrl}`);

// --- Stack readiness + test user ---------------------------------------------

console.log('Waiting for it to serve the API...');
const deadline = Date.now() + 5 * 60_000;
for (;;) {
	try {
		// 401 (no token) means it's up.
		// eslint-disable-next-line no-await-in-loop -- polling
		const response = await fetch(`${appUrl}/call/ice-servers`);
		if (response.status === 401) break;
	} catch {
		// Not reachable yet.
	}

	if (Date.now() > deadline) {
		fail(`${appUrl}/call/ice-servers didn't answer 401 within 5 minutes.`);
	}

	// eslint-disable-next-line no-await-in-loop -- polling
	await sleep(10_000);
}

// The user the flows log in as. Signing up fails harmlessly if it exists.
const user = {email: 'john.smith@gmail.com', password: 'ExamplePassword123'};
const post = async (route, body) =>
	fetch(`${appUrl}${route}`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});
await post('/auth/signup', {username: 'john2739', ...user});
const login = await post('/auth/login', user);
if (!login.ok) fail(`logging in as ${user.email} failed (${login.status}).`);

// --- APK -----------------------------------------------------------------------

// Everything that goes into the APK, as in the maestro-e2e action's cache key.
const inputs = [
	'mobile-app/src',
	'mobile-app/assets',
	'mobile-app/app.tsx',
	'mobile-app/index.ts',
	'mobile-app/app.json',
	'mobile-app/app.config.ts',
	'mobile-app/metro.config.js',
	'mobile-app/tsconfig.json',
	'mobile-app/package.json',
	'mobile-app/package-lock.json',
	'colors.json',
	'scripts/e2e-apk.mjs',
];

function* files(relative) {
	const absolute = path.join(repoRoot, relative);
	if (!fs.existsSync(absolute)) return;
	if (fs.statSync(absolute).isDirectory()) {
		for (const entry of fs.readdirSync(absolute).toSorted()) {
			yield* files(path.posix.join(relative, entry));
		}
	} else {
		yield relative;
	}
}

const hash = createHash('sha256').update(`${appUrl}\n${abi}\n`);
for (const file of inputs.flatMap((input) => [...files(input)])) {
	hash.update(`${file}\n`).update(fs.readFileSync(path.join(repoRoot, file)));
}

const key = hash.digest('hex');
let stamp;
try {
	stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
} catch {
	// No earlier build.
}

if (stamp?.key === key && fs.existsSync(apkPath)) {
	console.log(
		`Reusing the APK built for this URL, ABI and source (${apkPath}).`,
	);
} else {
	buildApk();
}

function buildApk() {
	// Gradle needs the SDK and a JDK. Default to Android Studio's: its bundled
	// JDK is the one it builds with, rather than whatever `java` is on PATH.
	const env = {...process.env};
	env.ANDROID_HOME ??=
		env.ANDROID_SDK_ROOT ??
		(isWindows
			? path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
			: process.platform === 'darwin'
				? path.join(os.homedir(), 'Library', 'Android', 'sdk')
				: path.join(os.homedir(), 'Android', 'Sdk'));
	if (!env.JAVA_HOME) {
		const studioJdk = isWindows
			? String.raw`C:\Program Files\Android\Android Studio\jbr`
			: process.platform === 'darwin'
				? '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
				: '/opt/android-studio/jbr';
		if (fs.existsSync(studioJdk)) env.JAVA_HOME = studioJdk;
	}

	// EXPO_PUBLIC_API_URL is compiled into the JS bundle. VONEO_E2E_BUILD lets an
	// http:// URL through (app.config.ts). CI=1 keeps prebuild non-interactive.
	Object.assign(env, {
		EXPO_PUBLIC_API_URL: appUrl,
		VONEO_E2E_BUILD: String(appUrl.startsWith('http://')),
		CI: '1',
	});

	// `shell` on Windows only, where npx and gradlew are .cmd/.bat files.
	function run(file, args, cwd) {
		const result = spawnSync(file, args, {
			cwd,
			env,
			stdio: 'inherit',
			shell: isWindows,
		});
		if (result.error) throw result.error;
		if (result.status !== 0) fail(`\`${file} ${args.join(' ')}\` failed.`);
	}

	// --clean regenerates android/ (gitignored) from scratch, so native config
	// from an earlier build (e.g. cleartext for an http:// URL) can't carry over.
	console.log(`Building the release APK for ${abi} (several minutes)...`);
	run(
		'npx',
		['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'],
		appDir,
	);
	run(
		isWindows ? 'gradlew.bat' : './gradlew',
		['assembleRelease', '--no-daemon', `-PreactNativeArchitectures=${abi}`],
		path.join(appDir, 'android'),
	);

	fs.mkdirSync(outDir, {recursive: true});
	fs.copyFileSync(
		path.join(
			appDir,
			'android',
			'app',
			'build',
			'outputs',
			'apk',
			'release',
			'app-release.apk',
		),
		apkPath,
	);
	fs.writeFileSync(stampPath, JSON.stringify({key, appUrl, abi}, null, '\t'));
	console.log(`Built ${apkPath}.`);
}
