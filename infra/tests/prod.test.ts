import {runSnapshotTest} from './snapshot.js';

// Prod's settings, so the snapshot also covers the coturn VM and budget
// resources.
await runSnapshotTest('prod', {
	'voneo-video-chat:turnEnabled': 'true',
	'voneo-video-chat:turnSecret': 'snapshot-test-turn-secret',
	'voneo-video-chat:billingAccount': 'snapshot-test-billing-account',
	'voneo-video-chat:budgetAmount': '20',
});
