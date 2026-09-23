import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {Call, User, CallParticipants} from '../common/models/index.js';
import {createWebSocketsServer} from './utils/ws-server.js';
import {removeUserFromCall} from './utils/leave-call.js';
import {getIceServersForUser} from './utils/ice-servers.js';

const ajv = new Ajv();
addFormats(ajv);

const callParametersSchema = {
	type: 'object',
	required: ['callID'],
	properties: {
		callID: {type: 'string', format: 'uuid'},
	},
};

const validateCallParameters = ajv.compile(callParametersSchema);

export async function createCall(request, response) {
	try {
		const {email} = request.user;

		const wsServerInfo = {callID: '', uri: ''};

		// Handling creating new websockets server for call
		try {
			const {callID, uri} = await createWebSocketsServer();
			console.log(callID, uri);
			wsServerInfo.callID = callID;
			wsServerInfo.uri = uri;
		} catch (error) {
			console.error('Error during creation of WebSocket server:', error);
			throw new Error('An error occured in our systems, please try again', {
				cause: error,
			});
		}

		// Checking details present for created websockets server before storing to memory
		if (!(wsServerInfo.callID || wsServerInfo.uri)) {
			console.error('No value stored for callID or uri fields in wsServerInfo');
			throw new Error('An error occured in our systems, please try again');
		}

		const {uri} = wsServerInfo;
		const {callID} = wsServerInfo;

		console.log('this is the uri within createCall handler:', uri);

		// Find the entry in 'users' table for user creating the call
		const retrievedUser = await User.findByPk(email);
		if (retrievedUser === null) {
			console.error(`User with email: ${email} not found in Users table`);
			throw new Error('Error finding record for user creating call');
		}

		// Add new call details and linked user to DB
		const newCall = await Call.create({
			callID,
			callURL: uri,
			totalDurationSecs: 0,
			activeCall: false,
		});

		await newCall.addUser(retrievedUser);

		response.status(201).json({success: true, data: {callID, callURL: uri}});
	} catch (error) {
		console.error('Error during call creation:', error);
		response.status(500).json({success: false, data: {error: 'Server error'}});
	}
}

export async function joinCall(request, response) {
	try {
		// Validate request params
		if (!validateCallParameters(request.params)) {
			console.log('Invalid call params:', validateCallParameters.errors);
			return response.status(400).json({
				success: false,
				data: {
					error: 'No Call ID passed',
					details: validateCallParameters.errors,
				},
			});
		}

		// Check if call ID exists
		const requestedCall = await Call.findByPk(request.params.callID);
		if (!requestedCall) {
			return response
				.status(404)
				.json({success: false, data: {error: 'Call ID not present'}});
		}

		// Verify call has not ended yet
		const isCallFinished = requestedCall.finishedAt;
		if (isCallFinished) {
			console.log('Call has already finished at:', isCallFinished);
			return response
				.status(400)
				.json({success: false, data: {error: 'Call has ended'}});
		}

		// Find the entry in 'users' table for user joining the call
		const {email} = request.user;
		const retrievedUser = await User.findByPk(email);
		if (retrievedUser === null) {
			console.error(`User with email: ${email} not found in Users table`);
			throw new Error('Error finding record for user joining call');
		}

		// Add pending participant (has to join WebSocket server) to in-memory config for current call
		await requestedCall.addUser(retrievedUser);

		// Retrieving the URL of the web socket server
		const requestedCallURL = requestedCall.callURL;

		return response
			.status(201)
			.json({success: true, data: {callURL: requestedCallURL}});
	} catch {
		response.status(500).json({success: false, data: {error: 'Server error'}});
	}
}

export async function leaveCall(request, response) {
	try {
		// Validate request params
		if (!validateCallParameters(request.params)) {
			return response.status(400).json({
				success: false,
				data: {
					error: 'No Call ID passed',
					details: validateCallParameters.errors,
				},
			});
		}

		const {callID} = request.params;
		const {email} = request.user;

		// Check if call ID exists
		const requestedCall = await Call.findByPk(callID);
		if (!requestedCall) {
			return response
				.status(404)
				.json({success: false, data: {error: 'Call ID not present'}});
		}

		// Check if call is active
		const isCallActive = requestedCall.activeCall;
		if (!isCallActive) {
			return response
				.status(400)
				.json({success: false, data: {error: 'Call is not active'}});
		}

		// Check if requesting user exists
		const retrievedUser = await User.findByPk(email);
		if (retrievedUser === null) {
			console.error(`User with email: ${email} not found in Users table`);
			throw new Error('Error finding record for user joining call');
		}

		// Check if user is logged as active participant on the call at present or if call has already finished
		const isUserActiveOnCall = await CallParticipants.findOne({
			where: {
				CallCallID: callID,
				UserEmail: email,
				status: 'active',
			},
		});
		const isCallFinished = requestedCall.finishedAt;

		if (!isUserActiveOnCall || isCallFinished) {
			return response.status(403).json({
				success: false,
				data: {error: 'Call is finished or user not an active participant'},
			});
		}

		await removeUserFromCall(requestedCall, retrievedUser);

		return response
			.status(200)
			.json({success: true, data: {message: 'User left call succesfully'}});
	} catch (error) {
		console.error('Error leaving call:', error);
		response.status(500).json({success: false, data: {error: 'Server error'}});
	}
}

export async function getIceServers(request, response) {
	try {
		const iceServers = getIceServersForUser(request.user.email);
		response.status(200).json({success: true, data: {iceServers}});
	} catch (error) {
		console.error('Error building ICE server config:', error);
		response.status(500).json({success: false, data: {error: 'Server error'}});
	}
}

export async function sendMessage(_request, response) {
	// Not yet implemented — see openapi.yaml (501 Not Implemented).
	response
		.status(501)
		.json({success: false, data: {message: 'Not implemented'}});
}
