import process from 'node:process';
import {rateLimit} from 'express-rate-limit';

// Cost guards, not per-client fairness. Neither is keyed on IP: requests
// reach the API through Google's front end and the frontend's proxy, so the
// client's IP is buried in a forgeable X-Forwarded-For chain.

const HOUR_MS = 60 * 60 * 1000;

function limitFromEnvironment(name, fallback) {
	const value = Number(process.env[name]);
	return Number.isInteger(value) && value > 0 ? value : fallback;
}

const sharedOptions = {
	windowMs: HOUR_MS,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	message: {success: false, data: {error: 'Too many requests'}},
	// X-Forwarded-For is expected behind the proxy and isn't used for keys.
	validate: {xForwardedForHeader: false},
};

// One limit shared by every signup: each new account can mint TURN
// credentials, so this caps how many an abuser can create.
export const signupRateLimit = rateLimit({
	...sharedOptions,
	limit: limitFromEnvironment('SIGNUP_RATE_LIMIT_PER_HOUR', 50),
	keyGenerator: () => 'all-signups',
});

// Per user (after `check`, which sets request.user): clients fetch ICE
// servers once per call, so this only stops scripted credential minting.
export const iceServersRateLimit = rateLimit({
	...sharedOptions,
	limit: limitFromEnvironment('ICE_SERVERS_RATE_LIMIT_PER_HOUR', 60),
	keyGenerator: (request) => request.user.email,
});
