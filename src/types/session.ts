export type BotStep =
  | 'idle'
  // Add date
  | 'add:title'
  | 'add:description'
  | 'add:date'
  | 'add:type'
  | 'add:repeat'
  | 'add:visibility'
  // Edit date
  | 'edit:choose'
  | 'edit:field'
  | 'edit:value'
  // Delete date
  | 'delete:choose'
  // Admin: manage privileged
  | 'admin:add_privileged'
  | 'admin:remove_privileged';

export interface SessionData {
  step: BotStep;
  draft: Record<string, unknown>;
}

export function initialSession(): SessionData {
  return { step: 'idle', draft: {} };
}
