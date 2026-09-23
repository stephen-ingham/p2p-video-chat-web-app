import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import App from '@/components/app.tsx';

const login = vi.fn();
const register = vi.fn();
const logout = vi.fn();
const createCall = vi.fn();
const joinCall = vi.fn();
const leaveCall = vi.fn();
const getIceServers = vi.fn();

vi.mock('@/lib/use-token-worker.ts', () => ({
	useTokenWorker: () => ({
		login,
		register,
		logout,
		createCall,
		joinCall,
		leaveCall,
		getIceServers,
	}),
}));

// CallScreen imports rtc-utils.ts, which drives real WebRTC/getUserMedia —
// none of which jsdom implements. Not exercised by this test, but mocked
// defensively so importing CallScreen at all can't attempt anything real.
vi.mock('@/lib/rtc-utils.ts', () => ({
	connectToCall: vi.fn(),
	sendChatMessageToCall: vi.fn(),
	closeConns: vi.fn(),
	closeWebSocketServerConn: vi.fn(),
}));

beforeEach(() => {
	login.mockReset();
	logout.mockReset();
});

describe('App', () => {
	it('logs in, then logs out back to the auth screen', async () => {
		login.mockResolvedValueOnce('Login Succesful!');
		logout.mockResolvedValueOnce('Logged out succesfully');
		const user = userEvent.setup();
		render(<App />);

		await user.type(screen.getByTestId('login-email'), 'alice@example.com');
		await user.type(screen.getByTestId('login-password'), 'secret123');
		await user.click(screen.getByTestId('login-submit'));

		expect(await screen.findByTestId('username')).toHaveTextContent('alice');

		await user.click(screen.getByTestId('logout-button'));

		expect(logout).toHaveBeenCalled();
		expect(await screen.findByTestId('login-email')).toBeInTheDocument();
	});
});
