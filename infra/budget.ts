import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Monthly budget on the stack's GCP project. The budget emails the billing
// account's admins at 50%, 90% and 100% of actual spend and at 100% of
// forecast spend.
//
// The budget covers the whole project, so prod-preview's runs (which deploy
// into prod's project) count towards prod's.

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
	billingAccount,
	amount,
	currency,
}: BudgetArguments) {
	const apis = ['billingbudgets', 'cloudbilling'].map(
		(name) =>
			new gcp.projects.Service(`${name}-api`, {
				service: `${name}.googleapis.com`,
				disableOnDestroy: false,
			}),
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
		},
		{provider: billingProvider, dependsOn: apis},
	);
}
