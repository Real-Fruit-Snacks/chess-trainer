import { Button, Card } from '@/components/ui';
import { PHRASES } from '../../../relay/src/live/shared.mjs';
import type { PhraseId, Side } from './types';
import './live.css';

/** The phrases shown: the latest few. */
const CHAT_LINES = 6;
const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];

/**
 * The set phrases players can send each other, and the latest ones sent: a
 * game's and a duel's alike (by side), and a race room's (by member). Nothing
 * typed ever goes anywhere.
 */
export function PhraseCard<By extends string = Side>({
  chat,
  you,
  opponentName = '',
  nameOf,
  onSay,
  disabled,
}: {
  chat: readonly { by: By; text: string }[];
  you: By;
  /** Who sent a phrase that is not this player's: the opponent in a game for two… */
  opponentName?: string;
  /** …or, in a room, each member by name. */
  nameOf?: (by: By) => string;
  onSay: (phrase: PhraseId) => void;
  disabled: boolean;
}) {
  const start = Math.max(0, chat.length - CHAT_LINES);
  const lines = chat.slice(start);
  return (
    <Card as="section" aria-labelledby="live-chat-title">
      <h2 id="live-chat-title" className="live-game__subtitle">
        Messages
      </h2>
      <div className="live-game__phrases" role="group" aria-label="Send a phrase">
        {PHRASE_IDS.map((id) => (
          <Button key={id} size="sm" onClick={() => onSay(id)} disabled={disabled}>
            {PHRASES[id]}
          </Button>
        ))}
      </div>
      {/* Polite: a phrase is read out after whatever is being read, never over it. */}
      <ol className="live-game__chat" aria-live="polite" aria-label="Messages so far">
        {lines.map((line, i) => (
          <li key={start + i}>
            <span className="live-game__chat-by">
              {line.by === you ? 'You' : (nameOf?.(line.by) ?? opponentName)}:
            </span>{' '}
            {line.text}
          </li>
        ))}
      </ol>
      {chat.length === 0 ? (
        <p className="small muted live-game__note">Only these set phrases can be sent.</p>
      ) : null}
    </Card>
  );
}
