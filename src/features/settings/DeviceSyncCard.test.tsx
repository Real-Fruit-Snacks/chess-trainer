import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncTotals } from '@/lib/sync/counts';
import { currentPhrase, stopSync } from '@/lib/sync/deviceSync';
import { applySnapshot, takeSnapshot } from '@/lib/sync/snapshot';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { installFakeRelay, type FakeRelay } from '@/test/fakeRelay';
import { otherDevice } from '@/test/syncDevices';
import { emptySnapshot, fixtureSnapshot, saveAnalysis, solvePuzzle } from '@/test/syncFixtures';
import { DeviceSyncCard } from './DeviceSyncCard';
import { formatCount } from './deviceSyncStatus';

vi.hoisted(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
/** Turning sync on derives keys, seals and compresses: slow when the suite runs in parallel. */
const SLOW = { timeout: 10_000 };

function Address() {
  const { pathname, hash } = useLocation();
  return <span data-testid="address">{`${pathname}${hash}`}</span>;
}

const renderCard = (at = '/settings') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <DeviceSyncCard />
      <Address />
    </MemoryRouter>,
  );

const openDialog = () => screen.getByRole('dialog');

let relay: FakeRelay;

beforeEach(() => {
  relay = installFakeRelay();
  applySnapshot(fixtureSnapshot(), takeSnapshot());
});

afterEach(async () => {
  await act(() => stopSync());
  useDeviceSyncStore.getState().clearStopped();
  useDeviceSyncStore.setState({ off: [] });
  vi.unstubAllGlobals();
  applySnapshot(emptySnapshot(), takeSnapshot());
  useSettings.setState({ ...DEFAULT_SETTINGS });
});

/** Turns sync on from the card, and closes the phrase. */
async function turnOnFromCard() {
  fireEvent.click(screen.getByTestId('sync-turn-on'));
  await screen.findByTestId('sync-phrase-words', {}, SLOW);
  fireEvent.click(screen.getByTestId('sync-phrase-done'));
}

describe('Settings → Sync between devices', () => {
  it('turns sync on and shows the new recovery phrase with its QR code', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('sync-turn-on'));
    const words = await screen.findByTestId('sync-phrase-words', {}, SLOW);
    // The dialog opens (an effect) just after its content renders.
    await waitFor(() => expect(openDialog()).toHaveTextContent('Sync is on: your recovery phrase'));
    expect(within(words).getAllByRole('listitem')).toHaveLength(12);
    expect(await screen.findByTestId('sync-qr', {}, SLOW)).toHaveAttribute('role', 'img');
    expect(relay.store.size()).toBe(1);

    fireEvent.click(screen.getByTestId('sync-phrase-done'));
    // The first run after turning on may be under way by now, on a slow machine.
    await waitFor(
      () => expect(screen.getByTestId('sync-status')).toHaveTextContent('Synced just now.'),
      SLOW,
    );
    expect(screen.getByTestId('sync-show-phrase')).toBeInTheDocument();
  });

  it('counts what it keeps in step, and says what each sync moved', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('sync-turn-on'));
    await screen.findByTestId('sync-phrase-words', {}, SLOW);
    fireEvent.click(screen.getByTestId('sync-phrase-done'));
    // Turning on sends everything: the status says how much, counted.
    const fixture = syncTotals(fixtureSnapshot());
    expect(screen.getByTestId('sync-status')).toHaveTextContent(
      new RegExp(`^Synced just now\\. ${formatCount(fixture.puzzles)} puzzles, .* sent\\.$`),
    );
    const totals = screen.getByTestId('sync-totals');
    const figure = (label: string) =>
      within(totals).getByText(label).parentElement?.querySelector('.stat__value')?.textContent;
    expect(figure('Puzzles')).toBe(formatCount(fixture.puzzles));
    expect(figure('Your repertoires')).toBe(String(fixture.repertoires));
    expect(figure('Saved analyses')).toBe(String(fixture.analyses));
    expect(figure('Imported games')).toBe(String(fixture.games));

    // Another device saves an analysis and solves a puzzle; this one solves one too.
    const words = await currentPhrase();
    const other = await otherDevice(words ?? []);
    await other.change((s) => solvePuzzle(saveAnalysis(s, 'an-phone', 'Phone', 1), 'there', 2));
    act(() => applySnapshot(solvePuzzle(takeSnapshot(), 'here', 3), takeSnapshot()));
    fireEvent.click(screen.getByTestId('sync-now'));
    await waitFor(
      () =>
        expect(screen.getByTestId('sync-status')).toHaveTextContent(
          'Synced just now. 1 puzzle and 1 analysis from your other devices; 1 puzzle sent.',
        ),
      SLOW,
    );
    // The totals follow.
    expect(figure('Puzzles')).toBe(formatCount(fixture.puzzles + 2));
    expect(figure('Saved analyses')).toBe(String(fixture.analyses + 1));
  });

  it('shows the phrase again, and turns sync off after asking', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('sync-turn-on'));
    const first = (await screen.findByTestId('sync-phrase-words', {}, SLOW)).textContent;
    fireEvent.click(screen.getByTestId('sync-phrase-done'));

    fireEvent.click(screen.getByTestId('sync-show-phrase'));
    expect((await screen.findByTestId('sync-phrase-words', {}, SLOW)).textContent).toBe(first);
    await waitFor(() => expect(openDialog()).toHaveTextContent('Your recovery phrase'));
    fireEvent.click(screen.getByTestId('sync-phrase-done'));

    fireEvent.click(screen.getByTestId('sync-turn-off'));
    fireEvent.click(screen.getByTestId('confirm-accept'));
    expect(await screen.findByTestId('sync-turn-on', {}, SLOW)).toBeInTheDocument();
    expect(useDeviceSyncStore.getState().secret).toBeNull();
    // The synced copy stays for the other devices.
    expect(relay.store.size()).toBe(1);
  });

  it('asks what to do with this device’s data when joining, and explains a wrong phrase', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('sync-join'));
    const dialog = openDialog();
    expect(within(dialog).getByTestId('sync-join-keep')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Keep both/ })).toBeChecked();
    expect(within(dialog).getByTestId('sync-join-settings')).toHaveTextContent(
      'This device takes the settings of your other devices',
    );
    fireEvent.change(within(dialog).getByTestId('sync-join-phrase'), {
      target: { value: PHRASE },
    });
    fireEvent.click(within(dialog).getByTestId('sync-join-confirm'));
    expect(await within(dialog).findByTestId('sync-join-error', {}, SLOW)).toHaveTextContent(
      'Nothing is synced under this phrase',
    );
  });

  it('opens the join dialog from a join link, and takes the phrase out of the address', async () => {
    renderCard(`/settings#sync=${PHRASE.replace(/ /g, '-')}`);
    await waitFor(() => expect(screen.getByTestId('sync-join-phrase')).toHaveValue(PHRASE));
    expect(openDialog()).toHaveTextContent('Join with a recovery phrase');
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/settings$/));
  });

  it('takes a mangled join link out of the address without breaking the page', async () => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      renderCard('/settings#sync=legal-winner-thank-100%');
      await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/settings$/));
      expect(errors).toEqual([]);
      // The words it holds are offered (what is not a word is dropped, as when typed).
      await waitFor(() =>
        expect(screen.getByTestId('sync-join-phrase')).toHaveValue('legal winner thank'),
      );
    } finally {
      window.removeEventListener('error', onError);
    }
  });

  it('stays open, with nothing to cancel, while a join is under way', async () => {
    let answer: (() => void) | null = null;
    relay.beforeRequest = () =>
      new Promise<void>((resolve) => {
        answer = resolve;
      });
    renderCard();
    fireEvent.click(screen.getByTestId('sync-join'));
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByTestId('sync-join-phrase'), {
      target: { value: PHRASE },
    });
    fireEvent.click(within(dialog).getByTestId('sync-join-confirm'));
    await waitFor(() => expect(answer).not.toBeNull(), SLOW);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    // Escape does not close it either.
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    relay.beforeRequest = null;
    act(() => answer?.());
    expect(await within(dialog).findByTestId('sync-join-error', {}, SLOW)).toHaveTextContent(
      'Nothing is synced under this phrase',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('counts the settings changed from the defaults among what turning on sent', async () => {
    useSettings.setState({ boardTheme: 'blue', pieceSet: 'merida', engineThreads: false });
    renderCard();
    await turnOnFromCard();
    expect(screen.getByTestId('sync-status')).toHaveTextContent(/ and 2 settings sent\.$/);
  });

  it('lets this device keep any part to itself, counting only what it syncs', async () => {
    renderCard();
    await turnOnFromCard();
    const parts = screen.getByRole('group', { name: 'What syncs on this device' });
    // Everything syncs, until this device keeps something to itself.
    expect(
      within(parts)
        .getAllByRole('switch')
        .map((s) => (s as HTMLInputElement).checked),
    ).toEqual([true, true, true, true, true]);
    for (const name of [
      'Progress',
      'Repertoires',
      'Saved analyses',
      'Imported games',
      'Settings',
    ]) {
      expect(within(parts).getByRole('switch', { name })).toBeChecked();
    }
    const totals = screen.getByTestId('sync-totals');
    expect(within(totals).getByText('Your repertoires')).toBeInTheDocument();

    fireEvent.click(within(parts).getByRole('switch', { name: 'Repertoires' }));
    expect(useDeviceSyncStore.getState().off).toEqual(['repertoire']);
    expect(within(parts).getByRole('switch', { name: 'Repertoires' })).not.toBeChecked();
    expect(within(totals).queryByText('Your repertoires')).toBeNull();
    expect(within(totals).queryByText('Repertoire moves')).toBeNull();

    // On again: it syncs straight away.
    relay.requests = [];
    fireEvent.click(within(parts).getByRole('switch', { name: 'Repertoires' }));
    expect(useDeviceSyncStore.getState().off).toEqual([]);
    await waitFor(() => expect(relay.requests.length).toBeGreaterThan(0), SLOW);
    expect(within(totals).getByText('Your repertoires')).toBeInTheDocument();
  });

  it('offers the choice before sync is turned on, kept for when it is', () => {
    renderCard();
    const choice = screen.getByTestId('sync-parts-choice');
    expect(choice.tagName).toBe('DETAILS');
    fireEvent.click(within(choice).getByRole('switch', { name: 'Settings' }));
    expect(useDeviceSyncStore.getState().off).toEqual(['settings']);
    expect(relay.requests).toEqual([]);
    // Joining then keeps this device's settings, and says so.
    fireEvent.click(screen.getByTestId('sync-join'));
    expect(within(openDialog()).getByTestId('sync-join-settings')).toHaveTextContent(
      'This device keeps its own settings',
    );
  });

  it('says when sync stopped because the synced copy was deleted', () => {
    useDeviceSyncStore.getState().turnOff('deleted');
    renderCard();
    expect(screen.getByTestId('sync-stopped')).toHaveTextContent('The synced copy was deleted');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByTestId('sync-stopped')).toBeNull();
  });
});
