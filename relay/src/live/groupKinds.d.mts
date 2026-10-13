/** Types for groupKinds.mjs, for the relay's tests. */
import type { GroupKindModule } from './group.mjs';

export function groupKind(kind: unknown): GroupKindModule<unknown> | null;
