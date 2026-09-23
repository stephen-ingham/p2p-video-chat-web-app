import crypto from 'node:crypto';
import process from 'node:process';

// Used when no self-hosted STUN/TURN server is configured (local dev) — fine
// for peers on the same network, but with no TURN relay, peers behind
// symmetric/carrier-grade NAT won't be able to connect to each other.
export const DEFAULT_STUN_URLS = [
	'stun:stun.l.google.com:19302',
	'stun:stun1.l.google.com:19302',
];

// How long minted TURN credentials stay valid. Only checked by coturn when a
// relay allocation is created/refreshed, so an in-progress call isn't cut off
// when they expire.
export const TURN_CREDENTIAL_TTL_SECS = 12 * 60 * 60;

// Builds the RTCPeerConnection `iceServers` list for a user. With TURN_URLS +
// TURN_SECRET set (production and the CI NAT-traversal stack), this points at
// the self-hosted coturn server, using coturn's TURN REST API credential
// scheme (`use-auth-secret` in infra/coturn/turnserver.conf): username is
// `<expiry unix secs>:<user id>`, password is base64(HMAC-SHA1(secret,
// username)). coturn recomputes the same HMAC, so no per-user state is stored.
export function getIceServersForUser(email, now = Date.now()) {
	const {TURN_URLS: turnUrls, TURN_SECRET: turnSecret} = process.env;

	if (!turnUrls || !turnSecret) {
		return [{urls: DEFAULT_STUN_URLS}];
	}

	const urls = turnUrls
		.split(',')
		.map((url) => url.trim())
		.filter(Boolean);
	const stunUrls = urls.filter((url) => url.startsWith('stun:'));
	const relayUrls = urls.filter((url) => /^turns?:/v.test(url));

	const expiry = Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECS;
	const username = `${expiry}:${email}`;
	const credential = crypto
		.createHmac('sha1', turnSecret)
		.update(username)
		.digest('base64');

	const iceServers = [];
	if (stunUrls.length > 0) iceServers.push({urls: stunUrls});
	if (relayUrls.length > 0) {
		iceServers.push({urls: relayUrls, username, credential});
	}

	return iceServers;
}
