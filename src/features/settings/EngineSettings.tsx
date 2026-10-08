import { Card, Field, Select, Switch } from '@/components/ui';
import { type ReviewDepth, useSettings } from '@/store/settings';
import { EngineDiagnostics } from './EngineDiagnostics';
import { EngineFullSetting } from './EngineFullSetting';
import { EngineThreadsSetting } from './EngineThreadsSetting';

/** Settings → Engine: how deeply it analyses, the online lookups, and the engine build itself. */
export function EngineSettings() {
  const settings = useSettings();
  return (
    <div className="settings__grid settings__grid--single">
      <Card>
        <h2 style={{ fontSize: '1.15rem' }}>Engine & analysis</h2>
        <div className="settings__group">
          <Field label="Game review depth" hint="Thorough is about twice as slow as fast.">
            {(id) => (
              <Select
                id={id}
                value={settings.reviewDepth}
                onChange={(e) => settings.update({ reviewDepth: e.target.value as ReviewDepth })}
              >
                <option value="fast">Fast (depth 10)</option>
                <option value="balanced">Balanced (depth 13)</option>
                <option value="thorough">Thorough (depth 16)</option>
              </Select>
            )}
          </Field>
          <Field label="Analysis depth" hint="Higher is stronger but slower on phones.">
            {(id) => (
              <Select
                id={id}
                value={settings.analysisDepth}
                onChange={(e) => settings.update({ analysisDepth: Number(e.target.value) })}
              >
                {[12, 15, 18, 20, 22, 24].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Switch
            checked={settings.tablebase}
            onChange={(v) => settings.update({ tablebase: v })}
            label="Endgame tablebase lookups"
            description="In analysis, ask the Lichess tablebase for exact results in positions with 7 pieces or fewer. Uses the network; off by default."
          />
          <Switch
            checked={settings.explorer}
            onChange={(v) => settings.update({ explorer: v })}
            label="Opening explorer lookups"
            description="In Analyze and Openings, show what masters and Lichess players play in the position and how it goes. Uses the network; off by default."
          />
          <EngineThreadsSetting />
          <EngineFullSetting />
          <EngineDiagnostics />
        </div>
      </Card>
    </div>
  );
}
