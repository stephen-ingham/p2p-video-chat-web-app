import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as dockerBuild from '@pulumi/docker-build';
import {createTurnServer} from './turn-server.js';

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config('gcp');

// Stack name ("dev"/"prod") suffixes resource names. Each stack is meant to
// deploy into its own GCP project (see infra/README.md): some resources here,
// like the load balancer's proxy-only subnet, can only exist once per region
// per network.
const stack = pulumi.getStack();
const project = gcpConfig.require('project');
const region = gcpConfig.get('region') ?? 'europe-west2';
const zone = `${region}-a`;
// Public hostname the app is served on, e.g. voneo.example.com. Its DNS A
// record must point at the `lbIp` output, and the `certDnsRecords` output must
// be added as a CNAME before the TLS certificate can be issued.
const domain = config.require('domain');

// Sensitive values — store with: pulumi config set --secret <key> <value> --stack <dev|prod>
const dbPassword = config.requireSecret('dbPassword');
const jwtSecret = config.requireSecret('jwtSecret');
const refreshTokenSecret = config.requireSecret('refreshTokenSecret');

// GCP APIs are off by default in a new project, and every resource below
// needs one of them.
const apis = [
	'artifactregistry',
	'certificatemanager',
	'compute',
	'iam',
	'run',
	'secretmanager',
	'sqladmin',
].map(
	(name) =>
		new gcp.projects.Service(`${name}-api`, {
			service: `${name}.googleapis.com`,
			disableOnDestroy: false,
		}),
);
const afterApis = {dependsOn: apis};

// Network //

// Own VPC rather than the project's auto-created `default` one, so the
// address ranges below are known and nothing depends on that network existing.
const network = new gcp.compute.Network(
	'vpc',
	{name: `voneo-${stack}`, autoCreateSubnetworks: false},
	afterApis,
);
const subnet = new gcp.compute.Subnetwork('vpc-subnet', {
	name: `voneo-${stack}`,
	region,
	network: network.id,
	ipCidrRange: '10.10.0.0/24',
});
// Regional external Application Load Balancers run their proxies in this
// subnet; one is required per region and network before one can be created.
const proxySubnet = new gcp.compute.Subnetwork('lb-proxy-subnet', {
	name: `voneo-lb-proxy-${stack}`,
	region,
	network: network.id,
	ipCidrRange: '10.10.2.0/23',
	purpose: 'REGIONAL_MANAGED_PROXY',
	role: 'ACTIVE',
});

// Secret Manager secrets //

const dbPasswordSecret = new gcp.secretmanager.Secret(
	'db-password-secret',
	{secretId: `db-password-${stack}`, replication: {auto: {}}},
	afterApis,
);
const dbPasswordSecretVersion = new gcp.secretmanager.SecretVersion(
	'db-password-version',
	{
		secret: dbPasswordSecret.name,
		secretData: dbPassword,
	},
);

const jwtSecret_ = new gcp.secretmanager.Secret(
	'jwt-secret',
	{secretId: `jwt-secret-${stack}`, replication: {auto: {}}},
	afterApis,
);
const jwtSecretVersion = new gcp.secretmanager.SecretVersion(
	'jwt-secret-version',
	{
		secret: jwtSecret_.name,
		secretData: jwtSecret,
	},
);

const refreshTokenSecret_ = new gcp.secretmanager.Secret(
	'refresh-token-secret',
	{secretId: `refresh-token-secret-${stack}`, replication: {auto: {}}},
	afterApis,
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
			region,
			zone,
			network: network.id,
			subnetwork: subnet.id,
			turnSecret: config.requireSecret('turnSecret'),
			dependsOn: apis,
		})
	: undefined;

// Container images //

// Pulumi builds both prod images and pushes them here, so one `pulumi up`
// creates the registry before pushing, and pushes before Cloud Run needs the
// image. Cloud Run is given each image's digest, so a code change always
// rolls out a new revision.
const registry = new gcp.artifactregistry.Repository(
	'images',
	{location: region, repositoryId: 'voneo', format: 'DOCKER'},
	afterApis,
);
const registryHost = `${region}-docker.pkg.dev`;
const registryAuth = {
	address: registryHost,
	username: 'oauth2accesstoken',
	password: gcp.organizations.getClientConfigOutput().accessToken,
};

// Paths are relative to infra/, where Pulumi runs.
const backendImage = new dockerBuild.Image(
	'backend-image',
	{
		context: {location: '../web-socket-api/src'},
		dockerfile: {location: '../web-socket-api/src/Dockerfile.prod'},
		platforms: ['linux/amd64'],
		push: true,
		registries: [registryAuth],
		tags: [
			pulumi.interpolate`${registryHost}/${project}/${registry.repositoryId}/voneo-backend:${stack}`,
		],
	},
	{dependsOn: [registry]},
);
const frontendImage = new dockerBuild.Image(
	'frontend-image',
	{
		context: {
			location: '../web-server/src',
			// Dockerfile.prod copies the shared colors.json from the repo root.
			named: {root: {location: '..'}},
		},
		dockerfile: {location: '../web-server/src/Dockerfile.prod'},
		platforms: ['linux/amd64'],
		push: true,
		registries: [registryAuth],
		tags: [
			pulumi.interpolate`${registryHost}/${project}/${registry.repositoryId}/voneo-frontend:${stack}`,
		],
	},
	{dependsOn: [registry]},
);

// Service accounts //

// One identity per Cloud Run service, holding only the access it needs,
// instead of the project-wide default compute service account.
const backendServiceAccount = new gcp.serviceaccount.Account(
	'backend-sa',
	{
		accountId: `voneo-backend-${stack}`,
		displayName: `Voneo signalling API (${stack})`,
	},
	afterApis,
);
const frontendServiceAccount = new gcp.serviceaccount.Account(
	'frontend-sa',
	{
		accountId: `voneo-frontend-${stack}`,
		displayName: `Voneo frontend (${stack})`,
	},
	afterApis,
);
const backendMember = pulumi.interpolate`serviceAccount:${backendServiceAccount.email}`;

const secretAccess = [
	{name: 'db-password-secret-access', secret: dbPasswordSecret},
	{name: 'jwt-secret-access', secret: jwtSecret_},
	{name: 'refresh-token-secret-access', secret: refreshTokenSecret_},
	...(turnServer
		? [{name: 'turn-secret-access', secret: turnServer.secret}]
		: []),
].map(
	({name, secret}) =>
		new gcp.secretmanager.SecretIamMember(name, {
			secretId: secret.id,
			role: 'roles/secretmanager.secretAccessor',
			member: backendMember,
		}),
);

// Lets the backend open connections through the Cloud SQL connector.
const cloudSqlClient = new gcp.projects.IAMMember('backend-cloudsql-client', {
	project,
	role: 'roles/cloudsql.client',
	member: backendMember,
});

// Database //

const dbInstance = new gcp.sql.DatabaseInstance(
	'instance',
	{
		name: `voneo-db-${stack}`,
		region,
		databaseVersion: 'MYSQL_8_4',
		settings: {
			// New MySQL 8.4 instances default to Enterprise Plus, which has no
			// shared-core tiers like db-f1-micro.
			edition: 'ENTERPRISE',
			tier: 'db-f1-micro',
			availabilityType: 'ZONAL',
			// A public IP with no authorized networks: nothing can connect
			// directly, only through the Cloud SQL connector, which checks the
			// caller's IAM access (roles/cloudsql.client above). Cloud Run's
			// Cloud SQL volume uses that connector.
			ipConfiguration: {
				ipv4Enabled: true,
				sslMode: 'ENCRYPTED_ONLY',
			},
		},
		deletionProtection: true,
	},
	afterApis,
);

const database = new gcp.sql.Database('db', {
	instance: dbInstance.name,
	name: 'voneo',
});

// MySQL user with password from Pulumi encrypted config
const dbUser = new gcp.sql.User('db-user', {
	instance: dbInstance.name,
	name: 'voneo',
	password: dbPassword,
});

// Cloud Run services //

const voneoFrontend = new gcp.cloudrunv2.Service(
	'frontend',
	{
		name: `voneo-frontend-${stack}`,
		location: region,
		deletionProtection: false,
		// Reachable only through the load balancer below, not its run.app URL.
		ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER',
		// No IAM check on requests: the load balancer forwards anonymous users.
		invokerIamDisabled: true,
		scaling: {
			minInstanceCount: 0,
			maxInstanceCount: 1,
		},
		template: {
			serviceAccount: frontendServiceAccount.email,
			containers: [{image: frontendImage.ref}],
		},
		traffics: [
			{
				type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST',
				percent: 100,
			},
		],
	},
	afterApis,
);

const voneoBackend = new gcp.cloudrunv2.Service(
	'backend',
	{
		name: `voneo-backend-${stack}`,
		location: region,
		deletionProtection: false,
		ingress: 'INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER',
		invokerIamDisabled: true,
		// Calls live in this instance's memory (session-store.js), so there
		// must only ever be one.
		scaling: {
			minInstanceCount: 0,
			maxInstanceCount: 1,
		},
		template: {
			serviceAccount: backendServiceAccount.email,
			// Cloud Run closes a request, including a WebSocket, after this.
			timeout: '3600s',
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
					image: backendImage.ref,
					ports: {containerPort: 3000},
					envs: [
						{name: 'NODE_ENV', value: 'production'},
						{name: 'ALLOWED_ORIGIN', value: `https://${domain}`},
						{name: 'DB_NAME', value: database.name},
						{name: 'DB_USER', value: dbUser.name},
						// A Unix socket path; database.js passes it as socketPath.
						{
							name: 'DB_HOST',
							value: pulumi.interpolate`/cloudsql/${dbInstance.connectionName}`,
						},
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
		// A revision fails to start if it can't read its secrets.
		dependsOn: [
			...apis,
			dbPasswordSecretVersion,
			jwtSecretVersion,
			refreshTokenSecretVersion,
			...(turnServer ? [turnServer.secretVersion] : []),
			...secretAccess,
			cloudSqlClient,
		],
	},
);

// Regional External Application Load Balancer //

const ip = new gcp.compute.Address(
	'lb-ip',
	{region, networkTier: 'STANDARD'},
	afterApis,
);

// Serverless NEGs point the load balancer at each Cloud Run service
const backendNeg = new gcp.compute.RegionNetworkEndpointGroup('backend-neg', {
	region,
	networkEndpointType: 'SERVERLESS',
	cloudRun: {service: voneoBackend.name},
});
const frontendNeg = new gcp.compute.RegionNetworkEndpointGroup('frontend-neg', {
	region,
	networkEndpointType: 'SERVERLESS',
	cloudRun: {service: voneoFrontend.name},
});

const backendService = new gcp.compute.RegionBackendService('lb-backend', {
	region,
	protocol: 'HTTP',
	loadBalancingScheme: 'EXTERNAL_MANAGED',
	// Also the WebSocket connection limit, matching the Cloud Run timeout.
	timeoutSec: 3600,
	backends: [
		{group: backendNeg.id, balancingMode: 'UTILIZATION', capacityScaler: 1},
	],
});
const frontendService = new gcp.compute.RegionBackendService('lb-frontend', {
	region,
	protocol: 'HTTP',
	loadBalancingScheme: 'EXTERNAL_MANAGED',
	timeoutSec: 30,
	backends: [
		{group: frontendNeg.id, balancingMode: 'UTILIZATION', capacityScaler: 1},
	],
});

// Path-based routing: API, call and WebSocket routes → backend, everything
// else → frontend. Same origin for both, so the web app needs no API URL.
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
			pathRules: [
				{paths: ['/auth/*', '/call/*', '/wss/*'], service: backendService.id},
			],
		},
	],
});

// Google-managed TLS certificate. Regional certificates can only be
// validated through DNS, via the CNAME in the `certDnsRecords` output.
const certDnsAuthorization = new gcp.certificatemanager.DnsAuthorization(
	'lb-cert-dns-auth',
	{
		name: `voneo-${stack}`,
		location: region,
		domain,
		type: 'PER_PROJECT_RECORD',
	},
	afterApis,
);
const cert = new gcp.certificatemanager.Certificate('lb-cert', {
	location: region,
	managed: {
		domains: [domain],
		dnsAuthorizations: [certDnsAuthorization.id],
	},
});

const httpsProxy = new gcp.compute.RegionTargetHttpsProxy('lb-https-proxy', {
	region,
	urlMap: urlMap.id,
	certificateManagerCertificates: [
		pulumi.interpolate`//certificatemanager.googleapis.com/${cert.id}`,
	],
});

const _httpsForwardingRule = new gcp.compute.ForwardingRule(
	'lb-forwarding-rule',
	{
		region,
		target: httpsProxy.id,
		portRange: '443',
		loadBalancingScheme: 'EXTERNAL_MANAGED',
		ipAddress: ip.address,
		network: network.id,
		networkTier: 'STANDARD',
	},
	{dependsOn: [proxySubnet]},
);

// Plain HTTP on the same IP only redirects to HTTPS.
const httpRedirectUrlMap = new gcp.compute.RegionUrlMap('lb-http-redirect', {
	region,
	defaultUrlRedirect: {httpsRedirect: true, stripQuery: false},
});
const httpProxy = new gcp.compute.RegionTargetHttpProxy('lb-http-proxy', {
	region,
	urlMap: httpRedirectUrlMap.id,
});
const _httpForwardingRule = new gcp.compute.ForwardingRule(
	'lb-http-forwarding-rule',
	{
		region,
		target: httpProxy.id,
		portRange: '80',
		loadBalancingScheme: 'EXTERNAL_MANAGED',
		ipAddress: ip.address,
		network: network.id,
		networkTier: 'STANDARD',
	},
	{dependsOn: [proxySubnet]},
);

export const lbIp = ip.address;
export const certDnsRecords = certDnsAuthorization.dnsResourceRecords;
export const turnIp = turnServer?.ip.address;
