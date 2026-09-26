import {runSnapshotTest} from './snapshot.js';

// The dev stack's settings: torn down after each e2e run, so an auto-named
// Cloud SQL instance without deletion protection, and a self-signed cert.
await runSnapshotTest('ephemeral', {
	'voneo-video-chat:domain': 'dev.voneo.test',
	'voneo-video-chat:ephemeral': 'true',
	'voneo-video-chat:turnEnabled': 'false',
});
