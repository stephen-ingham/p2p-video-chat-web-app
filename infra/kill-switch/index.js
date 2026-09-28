import {Buffer} from 'node:buffer';
import process from 'node:process';
import * as functions from '@google-cloud/functions-framework';

// Budget kill switch (infra/budget.ts). The stack's budget publishes a
// notification to Pub/Sub several times a day. Once the month's actual cost
// reaches the budget, this unlinks the project from its billing account,
// which stops every paid resource in it. See infra/README.md for how to turn
// billing back on.

const metadataTokenUrl =
	'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

async function getAccessToken() {
	const response = await fetch(metadataTokenUrl, {
		headers: {'Metadata-Flavor': 'Google'},
	});
	if (!response.ok) {
		throw new Error(`Metadata server returned ${response.status}`);
	}

	const {access_token: accessToken} = await response.json();
	return accessToken;
}

async function disableBilling(project) {
	const response = await fetch(
		`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${await getAccessToken()}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({billingAccountName: ''}),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Disabling billing failed: ${response.status} ${await response.text()}`,
		);
	}
}

functions.cloudEvent('killSwitch', async (cloudEvent) => {
	const notification = JSON.parse(
		Buffer.from(cloudEvent.data.message.data, 'base64').toString('utf8'),
	);
	const {costAmount, budgetAmount, currencyCode} = notification;
	const spend = `${costAmount} of ${budgetAmount} ${currencyCode}`;

	// Forecasts and lower alert thresholds only send emails.
	if (costAmount < budgetAmount) {
		console.log(`Under budget (${spend}), leaving billing on`);
		return;
	}

	const project = process.env.PROJECT_ID;
	await disableBilling(project);
	console.log(`Budget reached (${spend}): disabled billing on ${project}`);
});
