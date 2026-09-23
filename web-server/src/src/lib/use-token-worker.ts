let workerInstance: Worker | undefined;

function readEnvString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

type WorkerResponse =
	| {type: 'ResLogin'; message: string}
	| {type: 'ResSignup'; message: string}
	| {type: 'ResLogout'; message: string}
	| {type: 'ResCreateCall'; message: string | {callID: string}}
	| {type: 'ResJoinCall'; message: string}
	| {type: 'ResLeaveCall'; message: string}
	| {type: 'ResIceServers'; message: string | RTCIceServer[]};

function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker('/token-worker.js', {type: 'module'});
		workerInstance.postMessage({
			messageType: 'Init',
			apiBase: readEnvString(import.meta.env.PUBLIC_API_ORIGIN),
		});
	}

	return workerInstance;
}

async function ask(
	requestType: string,
	responseType: WorkerResponse['type'],
	body?: unknown,
): Promise<WorkerResponse> {
	return new Promise((resolve) => {
		const worker = getWorker();
		const handler = (event: MessageEvent<WorkerResponse>) => {
			if (event.data.type === responseType) {
				worker.removeEventListener('message', handler);
				resolve(event.data);
			}
		};

		worker.addEventListener('message', handler);
		worker.postMessage({messageType: requestType, requestBody: body});
	});
}

export function useTokenWorker() {
	async function login(email: string, password: string): Promise<string> {
		const response = await ask('ReqLogin', 'ResLogin', {email, password});
		if (response.type !== 'ResLogin') throw new Error('Unexpected response');
		return response.message;
	}

	async function register(
		username: string,
		email: string,
		password: string,
	): Promise<string> {
		const response = await ask('ReqSignup', 'ResSignup', {
			username,
			email,
			password,
		});
		if (response.type !== 'ResSignup') throw new Error('Unexpected response');
		return response.message;
	}

	async function logout(): Promise<string> {
		const response = await ask('ReqLogout', 'ResLogout');
		if (response.type !== 'ResLogout') throw new Error('Unexpected response');
		return response.message;
	}

	async function createCall(): Promise<string | {callID: string}> {
		const response = await ask('ReqCreateCall', 'ResCreateCall');
		if (response.type !== 'ResCreateCall')
			throw new Error('Unexpected response');
		return response.message;
	}

	async function joinCall(callId: string): Promise<string> {
		const response = await ask('ReqJoinCall', 'ResJoinCall', callId);
		if (response.type !== 'ResJoinCall') throw new Error('Unexpected response');
		return response.message;
	}

	async function leaveCall(callId: string): Promise<string> {
		const response = await ask('ReqLeaveCall', 'ResLeaveCall', callId);
		if (response.type !== 'ResLeaveCall')
			throw new Error('Unexpected response');
		return response.message;
	}

	async function getIceServers(): Promise<string | RTCIceServer[]> {
		const response = await ask('ReqIceServers', 'ResIceServers');
		if (response.type !== 'ResIceServers')
			throw new Error('Unexpected response');
		return response.message;
	}

	return {
		login,
		register,
		logout,
		createCall,
		joinCall,
		leaveCall,
		getIceServers,
	};
}
