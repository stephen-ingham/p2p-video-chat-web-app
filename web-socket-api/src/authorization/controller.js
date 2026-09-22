import process from 'node:process';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
	hashToken,
	createJti,
	signAccessToken,
	signRefreshToken,
	persistRefreshToken,
	setRefreshCookie,
	rotateRefreshToken,
} from '../common/middlewares/tokens.js';
import {
	User,
	Call,
	CallParticipants,
	RefreshToken,
} from '../common/models/index.js';
import {removeUserFromCall} from '../call/utils/leave-call.js';

const ajv = new Ajv();
addFormats(ajv);

const schema = {
	type: 'object',
	required: ['username', 'email', 'password'],
	properties: {
		username: {type: 'string', minLength: 3},
		email: {type: 'string', format: 'email'},
		password: {type: 'string', minLength: 6},
	},
};

const validate = ajv.compile(schema);

const hashPassword = (password) => bcrypt.hash(password, 10);

async function removeUserFromActiveCalls(email) {
	if (!email) return;

	const user = await User.findByPk(email);
	if (!user) return;

	const activeParticipations = await CallParticipants.findAll({
		where: {userEmail: email, status: 'active'},
	});

	for (const participation of activeParticipations) {
		// eslint-disable-next-line no-await-in-loop -- each call's shutdown must complete before the next
		const call = await Call.findByPk(participation.callCallID);
		// eslint-disable-next-line no-await-in-loop -- sequential per active call
		if (call) await removeUserFromCall(call, user);
	}
}

export async function register(request, response) {
	try {
		if (!validate(request.body)) {
			return response.status(400).json({
				success: false,
				data: {message: 'Invalid input', details: validate.errors},
			});
		}

		const {username, email, password} = request.body;
		const hashedPassword = await hashPassword(password);
		await User.create({
			username,
			email,
			password: hashedPassword,
		});

		response.status(201).json({
			success: true,
			data: {
				message: 'Succesful sign up',
			},
		});
	} catch (error) {
		console.error(error);
		response
			.status(500)
			.json({success: false, data: {message: 'Server error'}});
	}
}

export async function login(request, response) {
	try {
		const {email, password} = request.body;
		const user = await User.findByPk(email);
		if (!user)
			return response
				.status(400)
				.json({success: false, data: {message: 'Invalid credentials'}});

		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch)
			return response
				.status(400)
				.json({success: false, data: {message: 'Invalid credentials'}});

		const payload = {username: user.username, email: user.email};
		const accessToken = signAccessToken(payload);

		const jti = createJti();
		const refreshToken = signRefreshToken(user, jti);

		await persistRefreshToken({
			user,
			refreshToken,
			jti,
			ip: request.ip,
			userAgent: request.headers['user-agent'] || '',
		});

		setRefreshCookie(response, refreshToken);

		response.status(200).json({
			success: true,
			data: {token: accessToken},
		});
	} catch (error) {
		console.error(error);
		response
			.status(500)
			.json({success: false, data: {message: 'Server error'}});
	}
}

export async function logout(request, response) {
	try {
		const token = request.cookies?.refresh_token;
		if (token) {
			const tokenHash = hashToken(token);
			const doc = await RefreshToken.findOne({where: {tokenHash}});
			if (doc && !doc.revokedAt) {
				doc.revokedAt = new Date();
				await doc.save();
			}
		}

		await removeUserFromActiveCalls(request.user?.email);

		response.clearCookie('refresh_token', {path: '/auth'});
		response.json({
			success: true,
			data: {message: 'Logged out succesfully'},
		});
	} catch {
		response.status(500).json({
			success: false,
			data: {message: 'Server error'},
		});
	}
}

export async function refresh(request, response) {
	try {
		const token = request.cookies?.refresh_token;
		if (!token) return response.status(401).json({message: 'No refresh token'});

		let decoded;
		try {
			decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
		} catch {
			return response.status(401).json({
				success: false,
				data: {message: 'Invalid or expired refresh token'},
			});
		}

		const tokenHash = hashToken(token);
		const doc = await RefreshToken.findOne({
			where: {tokenHash, jti: decoded.jti},
			include: [User],
		});

		if (!doc) {
			return response
				.status(401)
				.json({message: 'Refresh token not recognized'});
		}

		if (doc.revokedAt) {
			return response.status(401).json({message: 'Refresh token revoked'});
		}

		if (doc.expiresAt < new Date()) {
			return response.status(401).json({message: 'Refresh token expired'});
		}

		const result = await rotateRefreshToken(doc, doc.user, request, response);
		return response.json({
			success: true,
			data: {accessToken: result.accessToken},
		});
	} catch {
		response
			.status(500)
			.json({success: false, data: {message: 'Server error'}});
	}
}
