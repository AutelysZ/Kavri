import type { AnyConstructor } from '@kavri/basic';

export interface WebSocketSharedOptions {
  /**
   * Short summary, used as message title in generated docs.
   */
  summary?: string;
  /**
   * Longer free-form description.
   */
  description?: string;
  /**
   * Deprecated must say why and alternative solution.
   */
  deprecated?: string;
  /**
   * Maximum payload size, in bytes, accepted by this side of the connection.
   */
  maxMessageSize?: number;
  /**
   * Wire codec used to (de)serialize message payloads, e.g. `'json'`,
   * `'msgpack'`, `'cbor'`. Defaults to `'json'` when omitted at the protocol
   * level. Per-message overrides take precedence over the protocol-level codec.
   */
  codec?: string;
}

export interface MessageOptions extends WebSocketSharedOptions {
  /**
   * Wire discriminator value used to identify which message arrived. Defaults
   * to the message key in the inbound/outbound map. Provide an explicit value
   * to keep wire-level identifiers stable when renaming the code-side key.
   */
  discriminator?: string;
}

/**
 * One message exchanged on a WebSocket. The direction (client → server or
 * server → client) is implicit in which map the message lives in on a
 * {@link WebSocketDefinition} — there is no `direction` field.
 *
 * `payload` semantics:
 *
 * - `null` — message carries no payload (e.g. heartbeat, ack).
 * - any class decorated with `@Schema` — structured payload validated by the
 *   schema runtime.
 * - `BinaryUnion` (from `decorators/route.ts`) — raw binary payload; the
 *   transport switches to binary frames.
 */
export interface Message<TPayload = unknown> extends MessageOptions {
  payload: AnyConstructor<TPayload> | null;
}

export interface WebSocketDefinition<
  TReq = unknown,
  TIn extends Record<string, Message> = Record<string, Message>,
  TOut extends Record<string, Message> = Record<string, Message>,
> extends WebSocketSharedOptions {
  /**
   * Protocol identifier, like `ChatProtocol`. Becomes the AsyncAPI tag for the
   * generated documentation.
   */
  name: string;

  /**
   * URL path of the WebSocket endpoint, like `/ws/chat`.
   */
  path: string;

  /**
   * Optional schema validated against the upgrade request (query string,
   * headers, cookies). Use this to enforce auth tokens, protocol version, etc.
   * when the connection is established. Type-parameterised so consumers
   * (handlers, codegen) can recover the request shape.
   */
  request?: AnyConstructor<TReq>;

  /**
   * Messages the server accepts (client → server). The key becomes the default
   * {@link MessageOptions.discriminator}, and is the stable handle the
   * server-side dispatch uses.
   */
  inbound: TIn;

  /**
   * Messages the server emits (server → client). The key becomes the default
   * {@link MessageOptions.discriminator}, and is the stable handle the
   * client-side dispatch uses.
   */
  outbound: TOut;
}

/**
 * Builder for a single message in a {@link WebSocketDefinition}.
 *
 * `payload` is the message body shape:
 *
 * - `null` — the message has no payload.
 * - any class decorated with `@Schema` — structured payload.
 * - `BinaryUnion` — raw binary payload.
 *
 * `discriminator` overrides the default discriminator (which is the message
 * key in the inbound/outbound map).
 */
export interface MessageBuilder {
  <TPayload>(
    payload: AnyConstructor<TPayload> | null,
    discriminator: string,
    options?: MessageOptions,
  ): Message<TPayload>;
  <TPayload>(
    payload: AnyConstructor<TPayload> | null,
    options?: MessageOptions,
  ): Message<TPayload>;
}

export const message: MessageBuilder = <TPayload>(
  payload: AnyConstructor<TPayload> | null,
  discriminatorOrOptions?: string | MessageOptions,
  options?: MessageOptions,
): Message<TPayload> => {
  const opts: MessageOptions =
    typeof discriminatorOrOptions === 'string'
      ? { ...options, discriminator: discriminatorOrOptions }
      : { ...options, ...discriminatorOrOptions };
  return { ...opts, payload };
};

export function defineWebSocket<
  TReq,
  TIn extends Record<string, Message>,
  TOut extends Record<string, Message>,
>(
  def: WebSocketDefinition<TReq, TIn, TOut>,
): WebSocketDefinition<TReq, TIn, TOut> {
  return def;
}
