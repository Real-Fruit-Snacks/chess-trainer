import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  NotFound,
  ProgressBar,
  Segmented,
  Switch,
} from './index';

// jsdom has no modal dialog support; the real element fires `close` on close().
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

describe('Dialog', () => {
  it('has a labelled close button when dismissible and fires onClose once', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Install on iPhone">
        <p>Steps</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleName('Install on iPhone');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialog).not.toHaveAttribute('open');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose once when the parent closes it, and not again on re-render', () => {
    const onClose = vi.fn();
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            hide
          </button>
          <Dialog
            open={open}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            title="T"
          >
            body
          </Dialog>
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'hide' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no close button and ignores Escape when not dismissible', () => {
    render(
      <Dialog open onClose={() => undefined} title="Must choose" dismissible={false}>
        body
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { hidden: true });
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it('closes on a backdrop click only when the press began on the backdrop too', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <p>content</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    // A drag that starts on the text and ends on the backdrop (selecting) is not a dismissal.
    fireEvent.pointerDown(screen.getByText('content'));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('stays open when a dialog inside it closes (a confirmation inside the library)', () => {
    const outerClose = vi.fn();
    function Nested() {
      const [inner, setInner] = useState(true);
      return (
        <Dialog open onClose={outerClose} title="Library">
          <ConfirmDialog
            open={inner}
            title="Delete it?"
            confirmLabel="Delete"
            onConfirm={() => undefined}
            onClose={() => setInner(false)}
          >
            <p>Gone for good.</p>
          </ConfirmDialog>
        </Dialog>
      );
    }
    render(<Nested />);
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(outerClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Library', hidden: true })).toHaveAttribute('open');
    expect(screen.queryByRole('dialog', { name: 'Delete it?' })).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  it('puts cancel first and the confirming action last, then closes', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Reset everything?"
        confirmLabel="Reset"
        danger
        onConfirm={onConfirm}
        onClose={onClose}
      >
        <p>This cannot be undone.</p>
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    const buttons = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent);
    // The title-row close control is last in the DOM (so content keeps the initial focus).
    expect(buttons.slice(0, 2)).toEqual(['Cancel', 'Reset']);
    const confirm = screen.getByTestId('confirm-accept');
    expect(confirm).toHaveClass('btn--danger');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('cancelling closes without confirming', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={onConfirm}
        onClose={onClose}
      >
        body
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Segmented', () => {
  function Host({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState('rated');
    return (
      <Segmented
        ariaLabel="Puzzle mode"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
        options={[
          { value: 'rated', label: 'Rated' },
          { value: 'themes', label: 'Themes' },
          { value: 'rush', label: 'Rush' },
        ]}
      />
    );
  }

  it('is a radio group with one tab stop, and the arrow keys move and select', () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Puzzle mode' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);

    act(() => radios[0]?.focus());
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('themes');
    expect(within(group).getByRole('radio', { name: 'Themes' })).toHaveFocus();
    expect(within(group).getByRole('radio', { name: 'Themes' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(group).getByRole('radio', { name: 'Rated' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // Roving: the selected option is now the only tab stop.
    expect(within(group).getByRole('radio', { name: 'Themes' }).tabIndex).toBe(0);
    expect(within(group).getByRole('radio', { name: 'Rated' }).tabIndex).toBe(-1);

    fireEvent.keyDown(group, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('rush');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('rated');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('rush');
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('rated');
  });

  it('selects on click as before', () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rush' }));
    expect(onChange).toHaveBeenCalledWith('rush');
  });

  it('can show no option as chosen, the first one keeping the tab stop', () => {
    const onChange = vi.fn();
    render(
      <Segmented<string>
        ariaLabel="Puzzle mode"
        value={null}
        onChange={onChange}
        options={[
          { value: 'rated', label: 'Rated' },
          { value: 'themes', label: 'Themes' },
        ]}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1]);
    // Clicking the first option chooses it: it was not chosen before.
    fireEvent.click(radios[0]!);
    expect(onChange).toHaveBeenCalledWith('rated');
  });
});

describe('Field, Switch and ProgressBar', () => {
  it('associates the hint with the control', () => {
    render(
      <Field label="Username" hint="Letters and digits only">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} />}
      </Field>,
    );
    const input = screen.getByLabelText('Username');
    expect(input).toHaveAccessibleDescription('Letters and digits only');
  });

  it('keeps the switch description out of its name', () => {
    render(
      <Switch
        checked={false}
        onChange={() => undefined}
        label="Sound effects"
        description="Move, capture and check cues."
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Sound effects' });
    expect(toggle).toHaveAccessibleDescription('Move, capture and check cues.');
  });

  it('reads a percentage, or the given text, rather than a raw number', () => {
    const { rerender } = render(<ProgressBar value={2_500_000} max={10_000_000} label="Storage" />);
    expect(screen.getByRole('progressbar', { name: 'Storage' })).toHaveAttribute(
      'aria-valuetext',
      '25%',
    );
    rerender(
      <ProgressBar
        value={2_500_000}
        max={10_000_000}
        label="Storage"
        valueText="2.5 MB of 10 MB used"
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Storage' })).toHaveAttribute(
      'aria-valuetext',
      '2.5 MB of 10 MB used',
    );
  });
});

describe('EmptyState and NotFound', () => {
  it('renders the title at the requested heading level', () => {
    render(
      <EmptyState title="Nothing yet" headingLevel={2}>
        <p>Add one.</p>
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing yet' })).toBeInTheDocument();
  });

  it('is an h1 with a way back to its section', () => {
    render(
      <MemoryRouter>
        <NotFound title="Study not found" backTo="/studies" backLabel="Back to studies">
          <p>No study has that id.</p>
        </NotFound>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Study not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to studies' })).toHaveAttribute(
      'href',
      '/studies',
    );
  });
});
