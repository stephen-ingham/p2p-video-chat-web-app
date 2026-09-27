import {runSnapshotTest} from './snapshot.js';

// The dev stack's settings: torn down after each e2e run, so an auto-named
// Cloud SQL instance without deletion protection.
await runSnapshotTest('ephemeral', {
	'voneo-video-chat:ephemeral': 'true',
	'voneo-video-chat:turnEnabled': 'false',
});
