/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment -- Pulumi's Mocks API (newResource/call args, JSON.parse of the snapshot fixture) is intentionally `any`-typed; casting at that boundary is the normal pattern, not a real type-safety gap. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import * as pulumi from '@pulumi/pulumi';

type ResourceInputs = Record<string, unknown>;

type ResourceRegistration = {
	type: string;
	name: string;
	inputs: ResourceInputs;
};

type Snapshot = {
	resources: ResourceRegistration[];
};

// Pulumi's own unit-testing framework: mocks the cloud provider so the
// program runs (and its exact resource registrations can be inspected)
// without any live GCP credentials or Pulumi backend — see
// https://www.pulumi.com/docs/iac/concepts/testing/unit/
//
// This snapshots *what the program declares* (resource type/name/inputs as
// registered with the mock provider), not a live infra diff. A real
// `pulumi preview --diff` snapshot against the actual backend/state would
// catch drift this can't (e.g. a change only visible via a real provider
// computation) — tracked as follow-up work once the dev/prod Pulumi
// backend from the deploy workflows is actually wired up.
const dirname = path.dirname(fileURLToPath(import.meta.url));

// Each *.test.ts file runs in its own process (node --test), so each one
// can call this once with its own stack config.
export async function runSnapshotTest(
	snapshotName: string,
	config: Record<string, string>,
): Promise<void> {
	const registrations: ResourceRegistration[] = [];

	await pulumi.runtime.setMocks(
		{
			newResource(arguments_) {
				registrations.push({
					type: arguments_.type,
					name: arguments_.name,
					inputs: arguments_.inputs as ResourceInputs,
				});
				return {
					id: `${arguments_.name}_id`,
					state: {
						...arguments_.inputs,
						// Read by the frontend's API_PROXY_TARGET.
						...(arguments_.type === 'gcp:cloudrunv2/service:Service' && {
							uri: `https://${arguments_.name}.run.app`,
						}),
					},
				};
			},
			call(arguments_) {
				return {
					...(arguments_.inputs as ResourceInputs),
					// Only getProject's is read, to build the frontend's URL.
					number: '123456789',
				};
			},
		},
		'voneo-video-chat',
		'snapshot-test',
		false,
	);

	pulumi.runtime.setAllConfig({
		// eslint-disable-next-line @typescript-eslint/naming-convention -- Pulumi's `<namespace>:<key>` config format
		'gcp:project': 'snapshot-test-project',
		'voneo-video-chat:dbPassword': 'snapshot-test-password',
		'voneo-video-chat:jwtSecret': 'snapshot-test-jwt-secret',
		'voneo-video-chat:refreshTokenSecret': 'snapshot-test-refresh-secret',
		// Pinned, as it's otherwise read from the repo's current commit.
		'voneo-video-chat:gitSha': 'snapshot-test-sha',
		...config,
	});

	const snapshotPath = path.join(
		dirname,
		'__snapshots__',
		`${snapshotName}.json`,
	);

	// Resources with no downstream dependant (e.g. one whose output nothing
	// else reads) can still be mid-registration after `import()` resolves —
	// Pulumi's mock framework has no public "wait for the program to settle"
	// hook, so poll until the registration count stops growing across two
	// consecutive checks instead of a single, fragile fixed delay.
	async function waitForRegistrationsToSettle(): Promise<void> {
		let previousCount = -1;
		while (registrations.length !== previousCount) {
			previousCount = registrations.length;
			// eslint-disable-next-line no-await-in-loop -- deliberate poll loop
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
		}
	}

	await test(`GCP resource declarations match the ${snapshotName} snapshot`, async () => {
		// Stack outputs like `appUrl` are provider-computed fields with no
		// meaningful value under mocks (the mock only echoes back create-time
		// inputs) — resource declarations below are the actual signal.
		await import('../index.js');
		await waitForRegistrationsToSettle();

		const actual: Snapshot = {
			resources: registrations.toSorted((a, b) =>
				`${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`),
			),
		};

		if (process.env.UPDATE_SNAPSHOT === '1') {
			fs.mkdirSync(path.dirname(snapshotPath), {recursive: true});
			fs.writeFileSync(snapshotPath, JSON.stringify(actual, null, 2) + '\n');
			return;
		}

		const expected = JSON.parse(
			fs.readFileSync(snapshotPath, 'utf8'),
		) as Snapshot;
		assert.deepEqual(
			actual,
			expected,
			'infra/index.ts now declares a different set of GCP resources than ' +
				`infra/tests/__snapshots__/${snapshotName}.json expects. If this ` +
				'change is intentional, regenerate it with: ' +
				'UPDATE_SNAPSHOT=1 npm test --prefix infra',
		);
	});
}
