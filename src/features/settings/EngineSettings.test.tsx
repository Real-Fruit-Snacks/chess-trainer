import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from '@/store/settings';
import { EngineSettings } from './EngineSettings';

describe('EngineSettings', () => {
  beforeEach(() => useSettings.getState().reset());

  it('says the opening explorer needs a Lichess account before it is switched on', () => {
    render(<EngineSettings />);
    const explorer = screen.getByRole('switch', { name: 'Opening explorer lookups' });
    expect(explorer).not.toBeChecked();
    expect(explorer).toHaveAccessibleDescription(
      /Needs a Lichess account, connected under Sync & data\. Uses the network; off by default\./,
    );
    fireEvent.click(explorer);
    expect(useSettings.getState().explorer).toBe(true);
  });
});
