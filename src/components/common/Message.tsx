import { Icon } from './Icon';

export type MessageKind = 'ok' | 'bad' | 'warn' | 'info';

export interface MessageState {
  kind: MessageKind;
  text: string;
}

const ICONS: Record<MessageKind, 'check' | 'error' | 'warning' | 'info'> = {
  ok: 'check',
  bad: 'error',
  warn: 'warning',
  info: 'info',
};

export function Message({ message }: { message: MessageState | null }) {
  if (!message) return null;
  return (
    <div className={`msg ${message.kind}`} role={message.kind === 'bad' ? 'alert' : 'status'}>
      <Icon name={ICONS[message.kind]} size={16} />
      <span>{message.text}</span>
    </div>
  );
}
