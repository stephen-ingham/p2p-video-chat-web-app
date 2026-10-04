import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import CallIdChip from '@/components/call-id-chip.tsx';

const callId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

beforeEach(() => {
	vi.useFakeTimers({shouldAdvanceTime: true});
});

afterEach(() => {
	vi.useRealTimers();
});

function setup() {
	// UserEvent swaps in its own clipboard stub, so spy on it after setup.
	const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
	const writeText = vi.spyOn(navigator.clipboard, 'writeText');
	render(
		<header className="relative">
			<CallIdChip callId={callId} />
		</header>,
	);
	return {user, writeText};
}

describe('CallIdChip', () => {
	it('shows the full call ID', () => {
		setup();

		expect(screen.getByTestId('call-id')).toHaveTextContent(callId);
	});

	it('copies the full ID, announces it, then resets after 2s', async () => {
		const {user, writeText} = setup();

		await user.click(screen.getByRole('button', {name: 'Copy call ID'}));

		expect(writeText).toHaveBeenCalledWith(callId);
		expect(await screen.findByText('Call ID copied')).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent('Call ID copied');

		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
	});

	it('says so when the clipboard is unavailable', async () => {
		const {user, writeText} = setup();
		writeText.mockRejectedValueOnce(new Error('NotAllowedError'));

		await user.click(screen.getByRole('button', {name: 'Copy call ID'}));

		expect(
			await screen.findByText("Couldn't copy. Select the ID instead."),
		).toBeInTheDocument();
	});
});
