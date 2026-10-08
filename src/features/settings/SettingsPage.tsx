import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { TabPanel, Tabs } from '@/components/ui';
import { siteConfig } from '@/site.config';
import { AppearanceSettings } from './AppearanceSettings';
import { AppSettings } from './AppSettings';
import { DataSettings } from './DataSettings';
import { EngineSettings } from './EngineSettings';
import { PlaySettings } from './PlaySettings';
import {
  cardForHash,
  DEFAULT_SETTINGS_TAB,
  hashForTab,
  SETTINGS_TABS,
  type SettingsTab,
  tabForHash,
} from './settingsTabs';
import './settings.css';

function TabContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'appearance':
      return <AppearanceSettings />;
    case 'play':
      return <PlaySettings />;
    case 'engine':
      return <EngineSettings />;
    case 'data':
      return <DataSettings />;
    case 'app':
      return <AppSettings />;
  }
}

/**
 * Settings, in tabs: Appearance, Play, Engine, Sync & data and App. The
 * address names the open tab (`/settings#engine`), and a link to a card
 * (`/settings#profiles`, a join link's `#sync=…`) opens the card's tab and
 * scrolls to it.
 */
export default function SettingsPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SettingsTab>(() => tabForHash(hash) ?? DEFAULT_SETTINGS_TAB);

  useEffect(() => {
    document.title = `Settings · ${siteConfig.name}`;
  }, []);

  // A link into the page opens its tab. An empty hash leaves the tab as it is: a card may
  // tidy its link away (a join link's phrase leaves the address at once).
  useEffect(() => {
    const linked = tabForHash(hash);
    if (linked) setTab(linked);
  }, [hash]);

  // The card a link points at is brought into view once its tab shows: at once, as a link to a
  // place in a page goes there, not with the smooth scrolling of the page's own moves.
  useEffect(() => {
    const card = cardForHash(hash);
    if (card && tabForHash(hash) === tab) {
      document.getElementById(card)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [hash, tab]);

  const open = (next: SettingsTab) => {
    setTab(next);
    // The address follows, so a reload or a shared link opens the same tab.
    void navigate({ hash: hashForTab(next) }, { replace: true });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>How the app looks and plays, and where your data goes.</p>
      </div>

      <div className="settings" data-testid="settings">
        <Tabs
          tabs={SETTINGS_TABS}
          value={tab}
          onChange={open}
          ariaLabel="Settings sections"
          idPrefix="settings"
        />
        {SETTINGS_TABS.map(({ id }) => (
          <TabPanel key={id} idPrefix="settings" id={id} active={id === tab}>
            <TabContent tab={id} />
          </TabPanel>
        ))}
      </div>
    </div>
  );
}
