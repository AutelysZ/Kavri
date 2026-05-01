import type { AnyConstructor } from '@kavri/basic';

export type MessageType = AnyConstructor | 'binary';

export interface WebSocketOptions {
  path: string;
  request?: AnyConstructor;
  title?: string;
  description?: string;
  codec?: string;
}

export interface WebSocketProtocol<
  TIn extends Record<string, MessageType> = Record<string, MessageType>,
  TOut extends Record<string, MessageType> = Record<string, MessageType>,
> {
  readonly name: string;
  readonly path: string;
  readonly options: WebSocketOptions;
  readonly inbound: TIn;
  readonly outbound: TOut;
}

export function defineWebSocket<
  TIn extends Record<string, MessageType>,
  TOut extends Record<string, MessageType>,
>(
  name: string,
  pathOrOptions: string | WebSocketOptions,
  messages: { inbound: TIn; outbound: TOut },
): WebSocketProtocol<TIn, TOut> {
  const options: WebSocketOptions =
    typeof pathOrOptions === 'string' ? { path: pathOrOptions } : pathOrOptions;
  return {
    name,
    path: options.path,
    options,
    inbound: messages.inbound,
    outbound: messages.outbound,
  };
}
