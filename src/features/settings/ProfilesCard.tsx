import { useState } from 'react';
import { Badge, Button, Card, Icon, Input } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { dropCopies } from '@/lib/sync/base';
import { activeProfile, nameTaken, useProfiles } from '@/store/profiles';

/**
 * Profiles: several learners on one device. Each profile has its own progress,
 * repertoires, games, analysis library and settings; the engine settings are
 * the device's, shared.
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
  const newNameTaken = nameTaken(profiles, newName);

  return (
    <Card id="profiles" data-testid="profiles">
      <h2 style={{ fontSize: '1.15rem' }}>Profiles</h2>
      <p className="small muted" style={{ margin: '0 0 12px' }}>
        Sharing this device? Each profile keeps its own progress, ratings, repertoires, games,
        library and settings — a new one starts with the settings of this one. The engine settings
        are the device’s, shared. You are <strong>{current.name}</strong>.
      </p>
      <ul role="list" className="profiles__list">
        {profiles.map((profile) => {
          const active = profile.id === activeId;
          const draftTaken = renaming === profile.id && nameTaken(profiles, draft, profile.id);
          return (
            <li key={profile.id} className="profiles__item" data-testid="profile-item">
              {renaming === profile.id ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draftTaken) return;
                    if (rename(profile.id, draft)) setRenaming(null);
                    else toast('Could not save the new name.', { tone: 'danger' });
                  }}
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenaming(null);
                      }
                    }}
                    aria-label="Profile name"
                    aria-invalid={draftTaken || undefined}
                    aria-describedby={draftTaken ? `rename-taken-${profile.id}` : undefined}
                    autoFocus
                    maxLength={40}
                  />
                  <Button size="sm" type="submit" disabled={!draft.trim() || draftTaken}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                  {draftTaken ? (
                    <span className="small muted" id={`rename-taken-${profile.id}`} role="status">
                      Another profile already has that name.
                    </span>
                  ) : null}
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
                          // Its device-sync copies go too (its synced copy stays for other devices).
                          void dropCopies(profile.id);
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
      {profiles.length > 1 ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          To delete the active profile, switch to another one first.
        </p>
      ) : null}
      <form
        className="row"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim() || newNameTaken) return;
          const profile = add(newName);
          if (!profile) {
            toast('Could not add the profile — storage may be full.', { tone: 'danger' });
            return;
          }
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
          aria-invalid={newNameTaken || undefined}
          aria-describedby={newNameTaken ? 'new-profile-taken' : undefined}
          maxLength={40}
          data-testid="new-profile-name"
        />
        <Button size="sm" type="submit" disabled={!newName.trim() || newNameTaken}>
          Add profile
        </Button>
        {newNameTaken ? (
          <span className="small muted" id="new-profile-taken" role="status">
            A profile called “{newName.trim()}” already exists.
          </span>
        ) : null}
      </form>
    </Card>
  );
}
