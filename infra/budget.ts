import crypto from 'node:crypto';
import fs from 'node:fs';
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Monthly budget on the stack's GCP project, with a kill switch. The budget
// emails the billing account's admins at 50%, 90% and 100% of actual spend
// and at 100% of forecast spend. It also publishes every update to Pub/Sub,
// where a Cloud Run function (infra/kill-switch/) disables billing on the
// project once actual spend reaches the budget. Billing data lags by a few
// hours, so spend can overshoot a little before that happens.
//
// The budget covers the whole project, so prod-preview's runs (which deploy
// into prod's project) count towards prod's.

// Deployed as the function's source. Named by content hash, so an edit
// uploads a new object and rebuilds the function.
const sourceFiles = ['index.js', 'package.json', 'package-lock.json'];
const sourceDirectory = new URL('kill-switch/', import.meta.url);
const sourceHash = crypto.createHash('sha256');
for (const file of sourceFiles) {
	sourceHash.update(fs.readFileSync(new URL(file, sourceDirectory)));
}

type BudgetArguments = {
	stack: string;
	project: string;
	projectNumber: pulumi.Input<string>;
	region: string;
	billingAccount: string;
	amount: number;
	currency: string;
};

export function createBudget({
	stack,
	project,
	projectNumber,
	region,
	billingAccount,
	amount,
	currency,
}: BudgetArguments) {
	const apis = [
		'billingbudgets',
		'cloudbilling',
		'cloudbuild',
		'cloudfunctions',
		'eventarc',
		'pubsub',
		'storage',
	].map(
		(name) =>
			new gcp.projects.Service(`${name}-api`, {
				service: `${name}.googleapis.com`,
				disableOnDestroy: false,
			}),
	);
	const afterApis = {dependsOn: apis};

	const topic = new gcp.pubsub.Topic(
		'budget-alerts',
		{name: `budget-alerts-${stack}`},
		afterApis,
	);

	// The Budget API bills its calls to a project. With service account
	// credentials (the deploy workflows) it needs one set explicitly.
	const billingProvider = new gcp.Provider('billing', {
		project,
		billingProject: project,
		userProjectOverride: true,
	});
	const _budget = new gcp.billing.Budget(
		'budget',
		{
			billingAccount,
			displayName: `voneo-${stack}`,
			budgetFilter: {
				projects: [pulumi.interpolate`projects/${projectNumber}`],
				calendarPeriod: 'MONTH',
			},
			amount: {
				specifiedAmount: {currencyCode: currency, units: String(amount)},
			},
			thresholdRules: [
				{thresholdPercent: 0.5},
				{thresholdPercent: 0.9},
				{thresholdPercent: 1},
				{thresholdPercent: 1, spendBasis: 'FORECASTED_SPEND'},
			],
			allUpdatesRule: {pubsubTopic: topic.id, schemaVersion: '1.0'},
		},
		{provider: billingProvider, dependsOn: apis},
	);

	// Runs the function. Project Billing Manager is the narrowest role that
	// can unlink the project from its billing account.
	const runtimeServiceAccount = new gcp.serviceaccount.Account(
		'kill-switch-sa',
		{
			accountId: `voneo-kill-switch-${stack}`,
			displayName: `Voneo budget kill switch (${stack})`,
		},
		afterApis,
	);
	const runtimeMember = pulumi.interpolate`serviceAccount:${runtimeServiceAccount.email}`;
	const _billingManager = new gcp.projects.IAMMember(
		'kill-switch-billing-manager',
		{project, role: 'roles/billing.projectManager', member: runtimeMember},
	);
	// Lets its Eventarc trigger deliver Pub/Sub messages as this identity.
	const eventReceiver = new gcp.projects.IAMMember(
		'kill-switch-event-receiver',
		{project, role: 'roles/eventarc.eventReceiver', member: runtimeMember},
	);

	// Builds the function's container, instead of the default compute service
	// account, which new projects no longer give build permissions.
	const buildServiceAccount = new gcp.serviceaccount.Account(
		'kill-switch-build-sa',
		{
			accountId: `voneo-fn-build-${stack}`,
			displayName: `Voneo kill switch builds (${stack})`,
		},
		afterApis,
	);
	const builder = new gcp.projects.IAMMember('kill-switch-builder', {
		project,
		role: 'roles/cloudbuild.builds.builder',
		member: pulumi.interpolate`serviceAccount:${buildServiceAccount.email}`,
	});

	const sourceBucket = new gcp.storage.Bucket(
		'kill-switch-source',
		{
			name: `${project}-kill-switch-${stack}`,
			location: region,
			uniformBucketLevelAccess: true,
			forceDestroy: true,
		},
		afterApis,
	);
	const source = new gcp.storage.BucketObject('kill-switch-source', {
		bucket: sourceBucket.name,
		name: `kill-switch-${sourceHash.digest('hex').slice(0, 16)}.zip`,
		source: new pulumi.asset.AssetArchive(
			Object.fromEntries(
				sourceFiles.map((file) => [
					file,
					new pulumi.asset.FileAsset(`kill-switch/${file}`),
				]),
			),
		),
	});

	const killSwitch = new gcp.cloudfunctionsv2.Function(
		'kill-switch',
		{
			name: `voneo-kill-switch-${stack}`,
			location: region,
			buildConfig: {
				runtime: 'nodejs22',
				entryPoint: 'killSwitch',
				serviceAccount: pulumi.interpolate`projects/${project}/serviceAccounts/${buildServiceAccount.email}`,
				source: {
					storageSource: {bucket: sourceBucket.name, object: source.name},
				},
			},
			serviceConfig: {
				serviceAccountEmail: runtimeServiceAccount.email,
				maxInstanceCount: 1,
				availableMemory: '256M',
				timeoutSeconds: 60,
				ingressSettings: 'ALLOW_INTERNAL_ONLY',
				// eslint-disable-next-line @typescript-eslint/naming-convention -- env var
				environmentVariables: {PROJECT_ID: project},
			},
			eventTrigger: {
				triggerRegion: region,
				eventType: 'google.cloud.pubsub.topic.v1.messagePublished',
				pubsubTopic: topic.id,
				serviceAccountEmail: runtimeServiceAccount.email,
				// The budget sends another update within hours anyway.
				retryPolicy: 'RETRY_POLICY_DO_NOT_RETRY',
			},
		},
		{dependsOn: [...apis, builder, eventReceiver]},
	);

	// The trigger calls the function's Cloud Run service as the runtime
	// identity, which needs permission to invoke it.
	const _invoker = new gcp.cloudrunv2.ServiceIamMember('kill-switch-invoker', {
		name: killSwitch.name,
		location: region,
		role: 'roles/run.invoker',
		member: runtimeMember,
	});
}
