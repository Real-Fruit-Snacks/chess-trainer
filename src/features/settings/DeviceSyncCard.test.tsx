import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stopSync } from '@/lib/sync/deviceSync';
import { applySnapshot, takeSnapshot } from '@/lib/sync/snapshot';
import { useDeviceSyncStore } from '@/store/deviceSync';
import { installFakeRelay, type FakeRelay } from '@/test/fakeRelay';
import { emptySnapshot, fixtureSnapshot } from '@/test/syncFixtures';
import { DeviceSyncCard } from './DeviceSyncCard';

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
  vi.unstubAllGlobals();
  applySnapshot(emptySnapshot(), takeSnapshot());
});

describe('Settings → Sync between devices', () => {
  it('turns sync on and shows the new recovery phrase with its QR code', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('sync-turn-on'));
    const words = await screen.findByTestId('sync-phrase-words');
    expect(within(words).getAllByRole('listitem')).toHaveLength(12);
    expect(openDialog()).toHaveTextContent('Sync is on: your recovery phrase');
    expect(await screen.findByTestId('sync-qr')).toHaveAttribute('role', 'img');
    expect(relay.store.size()).toBe(1);

    fireEvent.click(screen.getByTestId('sync-phrase-done'));
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Synced just now.');
    expect(screen.getByTestId('sync-show-phrase')).toBeInTheDocument();
  });

  it('shows the phrase again, and turns sync off after asking', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('sync-turn-on'));
    const first = (await screen.findByTestId('sync-phrase-words')).textContent;
    fireEvent.click(screen.getByTestId('sync-phrase-done'));

    fireEvent.click(screen.getByTestId('sync-show-phrase'));
    expect((await screen.findByTestId('sync-phrase-words')).textContent).toBe(first);
    expect(openDialog()).toHaveTextContent('Your recovery phrase');
    fireEvent.click(screen.getByTestId('sync-phrase-done'));

    fireEvent.click(screen.getByTestId('sync-turn-off'));
    fireEvent.click(screen.getByTestId('confirm-accept'));
    expect(await screen.findByTestId('sync-turn-on')).toBeInTheDocument();
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
    fireEvent.change(within(dialog).getByTestId('sync-join-phrase'), {
      target: { value: PHRASE },
    });
    fireEvent.click(within(dialog).getByTestId('sync-join-confirm'));
    expect(await within(dialog).findByTestId('sync-join-error')).toHaveTextContent(
      'Nothing is synced under this phrase',
    );
  });

  it('opens the join dialog from a join link, and takes the phrase out of the address', async () => {
    renderCard(`/settings#sync=${PHRASE.replace(/ /g, '-')}`);
    await waitFor(() => expect(screen.getByTestId('sync-join-phrase')).toHaveValue(PHRASE));
    expect(openDialog()).toHaveTextContent('Join with a recovery phrase');
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/settings$/));
  });

  it('says when sync stopped because the synced copy was deleted', () => {
    useDeviceSyncStore.getState().turnOff('deleted');
    renderCard();
    expect(screen.getByTestId('sync-stopped')).toHaveTextContent('The synced copy was deleted');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByTestId('sync-stopped')).toBeNull();
  });
});
