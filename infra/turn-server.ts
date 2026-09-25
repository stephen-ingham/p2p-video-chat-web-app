import fs from 'node:fs';
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Self-hosted STUN/TURN (coturn) on a small GCE VM. Cloud Run can't host it:
// TURN needs inbound UDP and a range of relay ports, and Cloud Run only
// exposes a single HTTP(S) port per service.
//
// The VM runs the same pinned coturn image, with the same base config
// (infra/coturn/turnserver.conf), as the CI NAT-traversal e2e stack
// (e2e/compose.nat.yaml) — keep coturnImage in sync with that file.
export const coturnImage = 'coturn/coturn:4.18.0';
export const turnPort = 3478;
// Must match min-port/max-port in infra/coturn/turnserver.conf.
export const turnRelayPortRange = '49152-49252';

// Production-only coturn lines: refuse to relay into private/link-local/
// metadata ranges, so the TURN server can't be used to reach the GCP VPC
// (e.g. 169.254.169.254) from outside. Not applied in CI, where every peer
// is on a private Docker network.
const deniedPeerIpRanges = [
	'0.0.0.0-0.255.255.255',
	'10.0.0.0-10.255.255.255',
	'100.64.0.0-100.127.255.255',
	'127.0.0.0-127.255.255.255',
	'169.254.0.0-169.254.255.255',
	'172.16.0.0-172.31.255.255',
	'192.168.0.0-192.168.255.255',
];

const baseCoturnConfig = fs.readFileSync(
	new URL('coturn/turnserver.conf', import.meta.url),
	'utf8',
);

type TurnServerArguments = {
	stack: string;
	region: string;
	zone: string;
	network: pulumi.Input<string>;
	subnetwork: pulumi.Input<string>;
	turnSecret: pulumi.Output<string>;
	// The GCP APIs these resources need (see index.ts).
	dependsOn: pulumi.Resource[];
};

export function createTurnServer({
	stack,
	region,
	zone,
	network,
	subnetwork,
	turnSecret,
	dependsOn,
}: TurnServerArguments) {
	const secret = new gcp.secretmanager.Secret(
		'turn-secret',
		{secretId: `turn-secret-${stack}`, replication: {auto: {}}},
		{dependsOn},
	);
	const secretVersion = new gcp.secretmanager.SecretVersion(
		'turn-secret-version',
		{
			secret: secret.name,
			secretData: turnSecret,
		},
	);

	// Dedicated identity so the VM can read only the TURN secret, rather than
	// running as the project-wide default compute service account.
	const serviceAccount = new gcp.serviceaccount.Account(
		'turn-vm-sa',
		{
			accountId: `voneo-turn-${stack}`,
			displayName: `Voneo coturn VM (${stack})`,
		},
		{dependsOn},
	);
	const _secretAccess = new gcp.secretmanager.SecretIamMember(
		'turn-vm-secret-access',
		{
			secretId: secret.id,
			role: 'roles/secretmanager.secretAccessor',
			member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
		},
	);

	const ip = new gcp.compute.Address(
		'turn-ip',
		{region, networkTier: 'STANDARD'},
		{dependsOn},
	);

	const networkTag = `voneo-turn-${stack}`;
	const _firewall = new gcp.compute.Firewall('turn-firewall', {
		network,
		direction: 'INGRESS',
		sourceRanges: ['0.0.0.0/0'],
		targetTags: [networkTag],
		allows: [
			{protocol: 'udp', ports: [String(turnPort), turnRelayPortRange]},
			{protocol: 'tcp', ports: [String(turnPort)]},
		],
	});

	// Container-Optimized OS boot script: reads the secret with the VM's own
	// identity (COS has no gcloud, so via the metadata token + REST API),
	// writes base config + production lines, and runs coturn on the host
	// network. Changing this script replaces the VM (the static IP is kept);
	// rotating only the secret needs a VM reset to be picked up.
	const startupScript = pulumi.interpolate`#!/bin/bash
set -euo pipefail

md=http://metadata.google.internal/computeMetadata/v1
internal_ip=$(curl -sf -H 'Metadata-Flavor: Google' "$md/instance/network-interfaces/0/ip")
token=$(curl -sf -H 'Metadata-Flavor: Google' "$md/instance/service-accounts/default/token" | sed -nE 's/.*"access_token": *"([^"]+)".*/\\1/p')
turn_secret=$(curl -sf -H "Authorization: Bearer $token" "https://secretmanager.googleapis.com/v1/${secret.id}/versions/latest:access" | sed -nE 's/.*"data": *"([^"]+)".*/\\1/p' | base64 -d)

conf_dir=/var/lib/voneo-coturn
mkdir -p "$conf_dir"
cat > "$conf_dir/turnserver.conf" <<'BASE_CONF'
${baseCoturnConfig}
BASE_CONF
cat >> "$conf_dir/turnserver.conf" <<PROD_CONF
external-ip=${ip.address}/$internal_ip
static-auth-secret=$turn_secret
${deniedPeerIpRanges.map((range) => `denied-peer-ip=${range}`).join('\n')}
allowed-peer-ip=$internal_ip
PROD_CONF
# coturn's image runs as nobody (65534); the file holds the TURN secret.
chown 65534:65534 "$conf_dir/turnserver.conf"
chmod 600 "$conf_dir/turnserver.conf"

docker rm -f coturn || true
docker run -d --name coturn --restart unless-stopped --network host \\
	-v "$conf_dir/turnserver.conf:/etc/coturn/turnserver.conf:ro" \\
	${coturnImage} -c /etc/coturn/turnserver.conf
`;

	const _instance = new gcp.compute.Instance(
		'turn-vm',
		{
			name: `voneo-turn-${stack}`,
			zone,
			machineType: 'e2-micro',
			tags: [networkTag],
			bootDisk: {
				initializeParams: {
					image: 'cos-cloud/cos-stable',
					size: 10,
					type: 'pd-standard',
				},
			},
			networkInterfaces: [
				{
					subnetwork,
					accessConfigs: [{natIp: ip.address, networkTier: 'STANDARD'}],
				},
			],
			serviceAccount: {
				email: serviceAccount.email,
				scopes: ['cloud-platform'],
			},
			metadataStartupScript: startupScript,
			allowStoppingForUpdate: true,
		},
		{dependsOn: [secretVersion]},
	);

	// Comma-separated list in the format the signalling API's TURN_URLS env
	// var expects (web-socket-api/src/call/utils/ice-servers.js).
	const urls = pulumi.interpolate`stun:${ip.address}:${turnPort},turn:${ip.address}:${turnPort}?transport=udp,turn:${ip.address}:${turnPort}?transport=tcp`;

	return {secret, secretVersion, ip, urls};
}
