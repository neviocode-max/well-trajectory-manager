export type MessageKind = 'ok' | 'bad' | 'warn' | 'info';

export interface MessageState {
  kind: MessageKind;
  text: string;
}

export function Message({ message }: { message: MessageState | null }) {
  if (!message) return null;
  return <div className={`msg ${message.kind}`}>{message.text}</div>;
}
