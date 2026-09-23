import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import {createTurnServer} from './turn-server.js';

const config = new pulumi.Config();

// Stack name (e.g. "dev"/"prod") suffixes resource/secret ids so the dev
// and prod stacks can coexist in the same GCP project without colliding —
// see infra/Pulumi.dev.yaml and infra/Pulumi.prod.yaml.
const stack = pulumi.getStack();

// Sensitive values — store with: pulumi config set --secret <key> <value> --stack <dev|prod>
const dbPassword = config.requireSecret('dbPassword');
const jwtSecret = config.requireSecret('jwtSecret');
const refreshTokenSecret = config.requireSecret('refreshTokenSecret');

// Secret Manager secrets
const dbPasswordSecret = new gcp.secretmanager.Secret('db-password-secret', {
	secretId: `db-password-${stack}`,
	replication: {auto: {}},
});
const dbPasswordSecretVersion = new gcp.secretmanager.SecretVersion(
	'db-password-version',
	{
		secret: dbPasswordSecret.name,
		secretData: dbPassword,
	},
);

const jwtSecret_ = new gcp.secretmanager.Secret('jwt-secret', {
	secretId: `jwt-secret-${stack}`,
	replication: {auto: {}},
});
const jwtSecretVersion = new gcp.secretmanager.SecretVersion(
	'jwt-secret-version',
	{
		secret: jwtSecret_.name,
		secretData: jwtSecret,
	},
);

const refreshTokenSecret_ = new gcp.secretmanager.Secret(
	'refresh-token-secret',
	{
		secretId: `refresh-token-secret-${stack}`,
		replication: {auto: {}},
	},
);
const refreshTokenSecretVersion = new gcp.secretmanager.SecretVersion(
	'refresh-token-secret-version',
	{
		secret: refreshTokenSecret_.name,
		secretData: refreshTokenSecret,
	},
);

// Self-hosted STUN/TURN (coturn VM) — see infra/turn-server.ts. Opt-in per
// stack via `voneo-video-chat:turnEnabled` (only prod enables it); without it
// the signalling API falls back to Google's public STUN servers, which is
// fine for same-network testing but gives no relay for peers behind strict
// NATs. When enabled, also set:
//   pulumi config set --secret turnSecret <value> --stack <dev|prod>
const turnEnabled = config.getBoolean('turnEnabled') ?? false;
const turnServer = turnEnabled
	? createTurnServer({
			stack,
			region: 'europe-west2',
			zone: 'europe-west2-a',
			turnSecret: config.requireSecret('turnSecret'),
		})
	: undefined;

// Voneo Frontend - Google Cloud V2 Run Service

const frontendImageTag = config.get('frontendImageTag') ?? 'latest';

const voneoFrontend = new gcp.cloudrunv2.Service('default', {
	name: `voneo-frontend-${stack}`,
	location: 'europe-west2',
	deletionProtection: false,
	ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER',
	scaling: {
		minInstanceCount: 0,
		maxInstanceCount: 1,
	},
	template: {
		containers: [
			{
				image: `europe-west2-docker.pkg.dev/signalling-api/voneo/voneo-frontend:${frontendImageTag}`,
			},
		],
	},
	traffics: [
		{
			type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST',
			percent: 100,
		},
	],
});

// Voneo Backend - Google Cloud V2 Run Service

const dbInstance = new gcp.sql.DatabaseInstance('instance', {
	name: `voneo-db-${stack}`,
	region: 'europe-west2',
	databaseVersion: 'MYSQL_8_4',
	settings: {
		tier: 'db-f1-micro',
		availabilityType: 'ZONAL',
		ipConfiguration: {
			ipv4Enabled: false,
		},
	},
	deletionProtection: true,
});

// MySQL user with password from Pulumi encrypted config
const dbUser = new gcp.sql.User('db-user', {
	instance: dbInstance.name,
	name: 'voneo',
	password: dbPassword,
});

const project = gcp.organizations.getProject({});

// Grant Cloud Run's default compute SA access to all three secrets
const secretIds = [
	{name: 'db-password-secret-access', secret: dbPasswordSecret},
	{name: 'jwt-secret-access', secret: jwtSecret_},
	{name: 'refresh-token-secret-access', secret: refreshTokenSecret_},
	...(turnServer
		? [{name: 'turn-secret-access', secret: turnServer.secret}]
		: []),
];
const _secretIamMembers = secretIds.map(
	({name, secret}) =>
		new gcp.secretmanager.SecretIamMember(
			name,
			{
				secretId: secret.id,
				role: 'roles/secretmanager.secretAccessor',
				member: project.then(
					(p) =>
						`serviceAccount:${p.number}-compute@developer.gserviceaccount.com`,
				),
			},
			{dependsOn: [secret]},
		),
);

const backendImageTag = config.get('backendImageTag') ?? 'latest';

const voneoBackend = new gcp.cloudrunv2.Service(
	'default',
	{
		name: `voneo-backend-${stack}`,
		location: 'europe-west2',
		deletionProtection: false,
		ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER',
		scaling: {
			minInstanceCount: 0,
			maxInstanceCount: 1,
		},
		template: {
			volumes: [
				{
					name: 'cloudsql',
					cloudSqlInstance: {
						instances: [dbInstance.connectionName],
					},
				},
			],
			containers: [
				{
					image: `europe-west2-docker.pkg.dev/signalling-api/voneo/voneo-backend:${backendImageTag}`,
					envs: [
						{name: 'NODE_ENV', value: 'production'},
						{name: 'DB_NAME', value: `voneo-db-${stack}`},
						{
							name: 'DB_HOST',
							value: pulumi.interpolate`/cloudsql/${dbInstance.connectionName}`,
						},
						{name: 'DB_PORT', value: '3306'},
						{
							name: 'DB_PASSWORD',
							valueSource: {
								secretKeyRef: {
									secret: dbPasswordSecret.secretId,
									version: 'latest',
								},
							},
						},
						{
							name: 'JWT_SECRET',
							valueSource: {
								secretKeyRef: {secret: jwtSecret_.secretId, version: 'latest'},
							},
						},
						{
							name: 'REFRESH_TOKEN_SECRET',
							valueSource: {
								secretKeyRef: {
									secret: refreshTokenSecret_.secretId,
									version: 'latest',
								},
							},
						},
						...(turnServer
							? [
									{name: 'TURN_URLS', value: turnServer.urls},
									{
										name: 'TURN_SECRET',
										valueSource: {
											secretKeyRef: {
												secret: turnServer.secret.secretId,
												version: 'latest',
											},
										},
									},
								]
							: []),
					],
					volumeMounts: [
						{
							name: 'cloudsql',
							mountPath: '/cloudsql',
						},
					],
				},
			],
		},
		traffics: [
			{
				type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST',
				percent: 100,
			},
		],
	},
	{
		dependsOn: [
			dbPasswordSecretVersion,
			jwtSecretVersion,
			refreshTokenSecretVersion,
			...(turnServer ? [turnServer.secretVersion] : []),
		],
	},
);

// Regional External ALB //

const region = 'europe-west2';
// TODO: set per-stack via `pulumi config set domain <host> --stack <dev|prod>`
// once real dev/prod domains exist (see CLAUDE.md "Known incomplete areas").
const domain = config.get('domain') ?? 'yourdomain.com';

// Regional IP
const ip = new gcp.compute.Address('lb-ip', {
	region,
	networkTier: 'STANDARD',
});

// NEG for the backend Cloud Run service
const backendNeg = new gcp.compute.RegionNetworkEndpointGroup('backend-neg', {
	region,
	networkEndpointType: 'SERVERLESS',
	cloudRun: {service: voneoBackend.name},
});

// NEG for the frontend Cloud Run service
const frontendNeg = new gcp.compute.RegionNetworkEndpointGroup('frontend-neg', {
	region,
	networkEndpointType: 'SERVERLESS',
	cloudRun: {service: voneoFrontend.name},
});

const backendService = new gcp.compute.RegionBackendService('lb-backend', {
	region,
	protocol: 'HTTP',
	loadBalancingScheme: 'EXTERNAL_MANAGED',
	timeoutSec: 3600,
	backends: [{group: backendNeg.id}],
});

const frontendService = new gcp.compute.RegionBackendService('lb-frontend', {
	region,
	protocol: 'HTTP',
	loadBalancingScheme: 'EXTERNAL_MANAGED',
	timeoutSec: 30,
	backends: [{group: frontendNeg.id}],
});

// Path-based routing: API + call routes → backend, everything else → frontend
const urlMap = new gcp.compute.RegionUrlMap('lb-url-map', {
	region,
	defaultService: frontendService.id,
	hostRules: [
		{
			hosts: [domain],
			pathMatcher: 'voneo-paths',
		},
	],
	pathMatchers: [
		{
			name: 'voneo-paths',
			defaultService: frontendService.id,
			pathRules: [{paths: ['/auth/*', '/call/*'], service: backendService.id}],
		},
	],
});

// Regional Google-managed SSL certificate via Certificate Manager
const cert = new gcp.certificatemanager.Certificate('lb-cert', {
	location: region,
	managed: {domains: [domain]},
});

const httpsProxy = new gcp.compute.RegionTargetHttpsProxy('lb-https-proxy', {
	region,
	urlMap: urlMap.id,
	certificateManagerCertificates: [
		pulumi.interpolate`//certificatemanager.googleapis.com/${cert.id}`,
	],
});

// Regional Forwarding Rule maps the IP to the HTTPS proxy
const forwardingRule = new gcp.compute.ForwardingRule('lb-forwarding-rule', {
	region,
	target: httpsProxy.id,
	portRange: '443',
	loadBalancingScheme: 'EXTERNAL_MANAGED',
	ipAddress: ip.address,
	networkTier: 'STANDARD',
});

export const lbIp = ip.address;
export const turnIp = turnServer?.ip.address;
