import { useState } from 'react';
import { Badge, Button, Card, Icon, Input } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { activeProfile, useProfiles } from '@/store/profiles';

/**
 * Profiles: several learners on one device. Each profile has its own progress,
 * repertoires, games and analysis library; device settings are shared.
 */
export function ProfilesCard() {
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const add = useProfiles((s) => s.add);
  const rename = useProfiles((s) => s.rename);
  const remove = useProfiles((s) => s.remove);
  const switchTo = useProfiles((s) => s.switchTo);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const current = activeProfile({ profiles, activeId });

  return (
    <Card id="profiles" data-testid="profiles">
      <h2 style={{ fontSize: '1.15rem' }}>Profiles</h2>
      <p className="small muted" style={{ margin: '0 0 12px' }}>
        Sharing this device? Each profile keeps its own progress, ratings, repertoires, games and
        library. Appearance and other device settings are shared. You are{' '}
        <strong>{current.name}</strong>.
      </p>
      <ul className="profiles__list">
        {profiles.map((profile) => {
          const active = profile.id === activeId;
          return (
            <li key={profile.id} className="profiles__item" data-testid="profile-item">
              {renaming === profile.id ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(profile.id, draft);
                    setRenaming(null);
                  }}
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Profile name"
                    autoFocus
                    maxLength={40}
                  />
                  <Button size="sm" type="submit">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <span className="profiles__name">
                  {profile.name}
                  {active ? <Badge tone="accent">Active</Badge> : null}
                </span>
              )}
              <span className="row profiles__actions">
                {!active ? (
                  <Button size="sm" variant="primary" onClick={() => switchTo(profile.id)}>
                    Switch
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenaming(profile.id);
                    setDraft(profile.name);
                  }}
                >
                  Rename
                </Button>
                {!active && profiles.length > 1 ? (
                  confirmRemove === profile.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          remove(profile.id);
                          setConfirmRemove(null);
                          toast(`Deleted the profile “${profile.name}” and its data.`);
                        }}
                      >
                        Delete for good
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon
                      aria-label={`Delete profile ${profile.name}`}
                      onClick={() => setConfirmRemove(profile.id)}
                    >
                      <Icon name="close" size={14} />
                    </Button>
                  )
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <form
        className="row"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const profile = add(newName);
          setNewName('');
          toast(`Added the profile “${profile.name}”. Switch to it when you are ready.`, {
            tone: 'success',
          });
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New profile name"
          aria-label="New profile name"
          maxLength={40}
          data-testid="new-profile-name"
        />
        <Button size="sm" type="submit" disabled={!newName.trim()}>
          Add profile
        </Button>
      </form>
    </Card>
  );
}
