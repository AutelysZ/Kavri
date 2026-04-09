# WebSocket Design

Package: `@kavri/web` — definitions in `@kavri/schema`, client in `@kavri/client`.

## 1. Design principles

- **Definition-first.** `defineWebSocket()` in `@kavri/schema` defines a typed bidirectional contract — shared between client and server, like `defineRoute`.
- **Handler = controller.** `@WebSocketHandler(def)` + `implements HandlerType<typeof def>` mirrors `@Controller(route)` + `implements ControllerType<typeof route>`.
- **No stringly-typed dispatch.** Inbound message types map to handler methods by name. Greppable. Type-safe.
- **Pluggable wire format.** `WebSocketCodec` abstract class handles encode/decode. Built-in `KavriWebSocketCodec` (JSON with `type`/`data` envelope). Custom codecs for binary protocols, STOMP, etc.
- **Per-connection AsyncContext.** `onOpen` runs in `AsyncContext.run()`. Message handlers `fork()` from it. Per-connection state works like per-request state.
- **ConnectionHub.** Separate injectable class for broadcasting. Handlers and controllers should never be injected by application code.
- **Auth via HTTP interceptors.** The upgrade request flows through the HTTP interceptor chain (ROUTE → CORS → GUARD). No separate auth mechanism.

## 2. Definition (`@kavri/schema`)

```ts
/** Message type: a @Schema class, or 'binary' for raw Uint8Array. */
type MessageType = AnyConstructor<any> | 'binary';

interface WebSocketOptions {
    /** WebSocket endpoint path. */
    path: string;
    /** Request params schema (path + query params). Validated on upgrade. */
    request?: AnyConstructor<any>;
    /** Title (for documentation). */
    title?: string;
    /** Description (for documentation). */
    description?: string;
    /** Codec name. Default: 'kavri'. Resolved via inject(WebSocketCodec, name). */
    codec?: string;
}

declare function defineWebSocket<
    TIn extends Record<string, MessageType>,
    TOut extends Record<string, MessageType>,
>(
    name: string,
    pathOrOptions: string | WebSocketOptions,
    messages: { inbound: TIn; outbound: TOut },
): WebSocketProtocol<TIn, TOut>;

interface WebSocketProtocol<
    TIn extends Record<string, MessageType> = any,
    TOut extends Record<string, MessageType> = any,
> {
    readonly name: string;
    readonly path: string;
    readonly options: WebSocketOptions;
    readonly inbound: TIn;
    readonly outbound: TOut;
}
```

Example:

```ts
@Schema()
class SendMessage {
    @IsString({ minLength: 1 }) text!: string;
}

@Schema()
class TypingEvent {
    @IsBoolean() typing!: boolean;
}

@Schema()
class ChatMessage {
    @IsString() from!: string;
    @IsString() text!: string;
    @IsInteger() timestamp!: number;
}

@Schema()
class UserPresence {
    @IsString() userId!: string;
    @IsBoolean() online!: boolean;
}

@Schema()
class ChatParams {
    @IsString() roomId!: string;
    @IsString({ optional: true }) token?: string;  // query param for auth fallback
}

const ChatProtocol = defineWebSocket('ChatProtocol', { path: '/chat/:roomId', request: ChatParams }, {
    inbound: {
        send: SendMessage,
        typing: TypingEvent,
        upload: 'binary',       // raw Uint8Array
    },
    outbound: {
        message: ChatMessage,
        presence: UserPresence,
        file: 'binary',
    },
});

// Custom codec:
const GameProtocol = defineWebSocket('GameProtocol', { path: '/game', codec: 'msgpack' }, {
    inbound: { move: MoveAction, ping: 'binary' },
    outbound: { state: GameState, pong: 'binary' },
});
```

## 3. WebSocketCodec

Abstract class for encoding/decoding wire format. Implementations are `@Component(name)`. Selected by `WebSocketOptions.codec` (default: `'kavri'`).

```ts
interface DecodedMessage {
    type: string;
    data: unknown;
}

abstract class WebSocketCodec {
    /**
     * Decode a text frame. Return decoded message, or undefined if
     * the frame is partial (buffering needed).
     */
    abstract decodeText(text: string, conn: WebSocketConnection): DecodedMessage | undefined;

    /**
     * Decode a binary frame. Return decoded message, or undefined if partial.
     */
    abstract decodeBinary(data: Uint8Array, conn: WebSocketConnection): DecodedMessage | undefined;

    /**
     * Encode an outbound message. Return one or more frames.
     * string → text frame, Uint8Array → binary frame.
     */
    abstract encode(type: string, data: unknown): string | Uint8Array | Array<string | Uint8Array>;
}
```

### Built-in: KavriWebSocketCodec

JSON envelope with `type` and `data` fields. Default codec.

```ts
@Component('kavri')
class KavriWebSocketCodec extends WebSocketCodec {
    decodeText(text: string): DecodedMessage | undefined {
        const parsed = JSON.parse(text);
        return { type: parsed.type, data: parsed.data };
    }

    decodeBinary(data: Uint8Array, conn: WebSocketConnection): DecodedMessage | undefined {
        // Binary frames are delivered as-is with type from a preceding text frame,
        // or as a standalone 'binary' type
        return { type: 'binary', data };
    }

    encode(type: string, data: unknown): string | Uint8Array {
        if (data instanceof Uint8Array) return data;
        return JSON.stringify({ type, data });
    }
}
```

Wire format:

```json
{ "type": "send", "data": { "text": "hello" } }
```

Inbound messages are validated against the `@Schema` class after decoding. Invalid messages receive an error frame:

```json
{ "type": "error", "data": { "message": "Validation failed", "issues": [...] } }
```

### Custom codec example

```ts
@Component('msgpack')
class MsgpackCodec extends WebSocketCodec {
    decodeText(text: string): DecodedMessage | undefined { return undefined; /* text not supported */ }
    decodeBinary(data: Uint8Array): DecodedMessage | undefined {
        const decoded = msgpack.decode(data) as { type: string; data: unknown };
        return decoded;
    }
    encode(type: string, data: unknown): Uint8Array {
        return msgpack.encode({ type, data });
    }
}

// Usage: @Touch(MsgpackCodec) in app module
```

## 4. WebSocketConnection

```ts
interface WebSocketConnection<T extends WebSocketProtocol = any, TState = any> {
    /** Unique connection ID. */
    readonly id: string;

    /** The protocol this connection belongs to. */
    readonly protocol: T;

    /**
     * Validated request params (path + query merged, parsed via request schema).
     * Typed when options.request is provided, otherwise Record<string, string>.
     */
    readonly params: T['options'] extends { request: AnyConstructor<infer R> } ? R : Record<string, string>;

    /**
     * Mutable per-connection state. Typed via the handler's TState parameter.
     * Initialized to {} on connection open. Accessible from any context that
     * has the connection reference (handler methods, ConnectionHub queries, etc.).
     */
    state: TState;

    /**
     * Index values for this connection. Used by ConnectionHub for O(1) lookups.
     * Keys are index names, values are the indexed value.
     * Set via conn.indexes.set('room', 'lobby') — automatically updates the hub's index.
     */
    readonly indexes: ConnectionIndexMap;

    /** Send a typed outbound message. Schema data is validated and encoded via the codec. */
    send<K extends keyof T['outbound'] & string>(
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;

    /** Close the connection. */
    close(code?: number, reason?: string): void;
}

/**
 * Reactive map that auto-updates the ConnectionHub's index when mutated.
 * Supports one value per index type per connection.
 */
interface ConnectionIndexMap extends Iterable<[string, unknown]> {
    get(indexType: string): unknown;
    /** Set an index value. Updates the hub's reverse index automatically. */
    set(indexType: string, value: unknown): void;
    /** Remove an index. Removes from the hub's reverse index. */
    delete(indexType: string): void;
    has(indexType: string): boolean;
    [Symbol.iterator](): Iterator<[string, unknown]>;
}
```

## 5. ConnectionHub

Single `@Component()` that manages ALL WebSocket connections across all handlers. Stores connections grouped by protocol, with reverse indexes for O(1) lookups.

**Handlers and controllers should never be injected by application code.**

### Internal storage

```ts
// Conceptual structure:
{
    connections: Map<WebSocketProtocol, Set<WebSocketConnection>>,
    indexes: Map<string, Map<unknown, Set<WebSocketConnection>>>,
    //         indexType    indexValue    connections with that value
}
```

When `conn.indexes.set('room', 'lobby')` is called, the hub's reverse index is updated:
- `indexes.get('room').get('lobby')` now includes `conn`

When the connection closes or calls `conn.indexes.delete('room')`, it's removed from the reverse index.

### API

```ts
@Component()
class ConnectionHub {
    /** Get all connections for a protocol. */
    of<T extends WebSocketProtocol>(protocol: T): ReadonlySet<WebSocketConnection<T>>;

    /** Get connections matching an index value. O(1) lookup. */
    byIndex<T extends WebSocketProtocol>(
        protocol: T,
        indexType: string,
        indexValue: unknown,
    ): ReadonlySet<WebSocketConnection<T>>;

    /** Broadcast to all connections of a protocol. */
    broadcast<T extends WebSocketProtocol, K extends keyof T['outbound'] & string>(
        protocol: T,
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;

    /** Broadcast to connections matching an index. O(1) — no iteration over all connections. */
    broadcastByIndex<T extends WebSocketProtocol, K extends keyof T['outbound'] & string>(
        protocol: T,
        indexType: string,
        indexValue: unknown,
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;

    /** Broadcast to connections matching a predicate. Iterates. */
    broadcastTo<T extends WebSocketProtocol, K extends keyof T['outbound'] & string>(
        protocol: T,
        predicate: (conn: WebSocketConnection<T>) => boolean,
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;
}
```

### Usage

```ts
@Component()
class NotificationService {
    constructor(private readonly hub = inject(ConnectionHub)) {}

    /** O(1) — uses index, no iteration */
    async notifyRoom(roomId: string, message: ChatMessage) {
        this.hub.broadcastByIndex(ChatProtocol, 'room', roomId, 'message', message);
    }

    /** Iterate all connections of a protocol */
    getOnlineUsers(): string[] {
        return [...this.hub.of(ChatProtocol)].map(c => c.state.username);
    }
}
```

## 6. Handler

```ts
/**
 * HandlerType maps a WebSocketProtocol's inbound messages to handler methods.
 * TState types the connection's state field.
 * For each inbound key K:
 *   type = 'binary'  → on{Capitalize<K>}(data: Uint8Array, conn): Awaitable<void>
 *   type = class      → on{Capitalize<K>}(data: InstanceType<class>, conn): Awaitable<void>
 */
type HandlerType<T extends WebSocketProtocol, TState = any> = {
    [K in keyof T['inbound'] as `on${Capitalize<string & K>}`]:
        /* (data: ..., conn: WebSocketConnection<T, TState>) => Awaitable<void> */
};

/**
 * Base class for WebSocket handlers. Provides lifecycle hooks,
 * convenience broadcast methods scoped to this handler's protocol,
 * and access to the ConnectionHub.
 */
abstract class WebSocketHandlerBase<T extends WebSocketProtocol, TState = any> {
    constructor(protected readonly hub = inject(ConnectionHub)) {}

    // The protocol is set by @WebSocketHandler(protocol)
    protected abstract readonly protocol: T;

    /** Broadcast to ALL connections of this handler's protocol. */
    broadcast<K extends keyof T['outbound'] & string>(
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void {
        this.hub.broadcast(this.protocol, type, data);
    }

    /** Broadcast to matching connections of this handler's protocol. */
    broadcastTo<K extends keyof T['outbound'] & string>(
        predicate: (conn: WebSocketConnection<T, TState>) => boolean,
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void {
        this.hub.broadcastTo(this.protocol, predicate, type, data);
    }

    /** Broadcast to connections matching an index. O(1). */
    broadcastByIndex<K extends keyof T['outbound'] & string>(
        indexType: string,
        indexValue: unknown,
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void {
        this.hub.broadcastByIndex(this.protocol, indexType, indexValue, type, data);
    }

    /** Called when a connection opens. Runs in AsyncContext.run(). */
    onOpen?(conn: WebSocketConnection<T, TState>): Awaitable<void>;

    /** Called when a connection closes. */
    onClose?(conn: WebSocketConnection<T, TState>, code: number, reason: string): Awaitable<void>;

    /** Called on connection error. */
    onError?(conn: WebSocketConnection<T, TState>, error: Error): Awaitable<void>;
}

/**
 * Marks a class as a WebSocket handler. Composes @Component().
 * Registers the definition's path for WebSocket upgrade routing.
 */
declare function WebSocketHandler<T extends WebSocketProtocol>(
    def: T,
): ClassDecorator<{ def: T }>;
```

Example handler:

```ts
/** Typed per-connection state. */
interface ChatState {
    username: string;
    joinedAt: number;
}

@WebSocketHandler(ChatProtocol)
class ChatHandler
    extends WebSocketHandlerBase<typeof ChatProtocol, ChatState>
    implements HandlerType<typeof ChatProtocol, ChatState>
{
    constructor(
        private readonly repo = inject(MessageRepository),
        private readonly logger = injectLogger(ChatHandler),
    ) { super(); }

    // --- Lifecycle ---

    onOpen(conn: WebSocketConnection<typeof ChatProtocol, ChatState>) {
        const user = CurrentUser.getOrThrow();
        conn.state.username = user.name;
        conn.state.joinedAt = Date.now();

        // Set index for O(1) room-scoped broadcasts
        conn.indexes.set('room', conn.params.roomId);

        this.logger.info('user %s joined room %s', user.name, conn.params.roomId);
    }

    onClose(conn: WebSocketConnection<typeof ChatProtocol, ChatState>) {
        // O(1) — broadcast to same room via index
        this.broadcastByIndex('room', conn.params.roomId,
            'presence',
            { userId: conn.state.username, online: false },
        );
        // conn.indexes auto-cleaned on close
    }

    // --- Inbound message handlers (required by HandlerType) ---

    onSend(data: SendMessage, conn: WebSocketConnection<typeof ChatProtocol, ChatState>) {
        const msg = { from: conn.state.username, text: data.text, timestamp: Date.now() };
        this.repo.save(conn.params.roomId, msg);

        // O(1) — broadcast to same room via index
        this.broadcastByIndex('room', conn.params.roomId, 'message', msg);
    }

    onTyping(data: TypingEvent, conn: WebSocketConnection<typeof ChatProtocol, ChatState>) {
        // broadcast typing indicator to room
        this.broadcastByIndex('room', conn.params.roomId, 'presence',
            { userId: conn.state.username, online: true });
    }

    onUpload(data: Uint8Array, conn: WebSocketConnection<typeof ChatProtocol, ChatState>) {
        // handle binary upload
    }
}
```

Method naming: inbound key `send` → method `onSend`, key `typing` → method `onTyping`. Enforced by `HandlerType`.

## 7. Per-connection AsyncContext

Each connection gets its own `AsyncContext` scope:

```
Connection established
  └─ AsyncContext.run()          ← root scope for this connection
       ├─ onOpen(conn)           ← set up per-connection state
       ├─ fork() → onSend(...)   ← inherits connection state
       ├─ fork() → onTyping(...) ← inherits connection state
       └─ onClose(conn)          ← still in connection scope
```

State set in `onOpen` (e.g., `CurrentUser.set(user)`) is visible in all subsequent message handlers via prototype-chained scope. Each message handler runs in a `fork()` so it can set transient state without leaking to other messages.

## 8. Upgrade flow

The `http.Server` `'upgrade'` event is handled by `WebApplication`:

```
Client sends: GET /chat/room1 (Upgrade: websocket)
  │
  ▼
WebApplication.handleUpgrade(req, socket, head)
  │
  ▼
AsyncContext.run():
  kRequest.set(req)
  kURL.set(...)
  │
  ▼
RouteInterceptor.matchWebSocket(req.url)
  → sets kEndpoint (WebSocket), kPathParams
  → if request schema exists: merge path params + query, validate, parse
  │
  ▼
[CorsInterceptor] → checks Origin header
  │
  ▼
[AuthInterceptor] → validates token, sets CurrentUser
  │
  ▼
Upgrade succeeds → WebSocket connection established
  │
  ▼
Handler.onOpen(conn)  ← in new per-connection AsyncContext.run()
                         inherits state from upgrade scope (CurrentUser, etc.)
```

HTTP interceptors run on the upgrade request up to `Interceptor.GUARD`. Auth, CORS, rate limiting all work naturally.

## 9. Configuration

```ts
@Configuration('kavri.web.ws')
class WebSocketConfig {
    /** Max inbound message size in bytes. */
    @IsInteger({ default: 65536 }) maxMessageSize!: number;
    /** Ping interval in ms. 0 to disable. */
    @IsInteger({ default: 30000 }) pingInterval!: number;
    /** Close connection if pong not received within this time. */
    @IsInteger({ default: 10000 }) pingTimeout!: number;
}
```

Ping/pong is automatic. The framework sends pings at `pingInterval` and closes connections that don't respond within `pingTimeout`.

## 10. Client (`@kavri/client`)

```ts
import { createWebSocketClient } from '@kavri/client';

const ws = createWebSocketClient(ChatProtocol, { url: 'wss://example.com' });

// Typed send — only inbound message types allowed
ws.send('send', { text: 'hello' });
ws.send('typing', { typing: true });
ws.send('upload', new Uint8Array([...]));  // binary

// Typed receive — only outbound message types
ws.on('message', (data: ChatMessage) => {
    console.log(`${data.from}: ${data.text}`);
});
ws.on('presence', (data: UserPresence) => { ... });
ws.on('file', (data: Uint8Array) => { ... });  // binary

// Lifecycle
ws.on('open', () => { ... });
ws.on('close', (code, reason) => { ... });
ws.on('error', (err) => { ... });

ws.close();
```

## 11. Example: multi-room chat

```ts
import { Schema, IsString, IsBoolean, IsInteger, defineWebSocket } from '@kavri/schema';
import {
    WebSocketHandler, WebSocketHandlerBase, HandlerType,
    WebSocketConnection, ConnectionHub,
} from '@kavri/web';
import { Component, Touch, inject } from '@kavri/container';
import { injectLogger } from '@kavri/logging';

// --- Definition (shared) ---

@Schema()
class JoinRoom { @IsString() room!: string; }

@Schema()
class LeaveRoom { @IsString() room!: string; }

@Schema()
class SendMsg { @IsString() text!: string; }

@Schema()
class ChatMsg {
    @IsString() from!: string;
    @IsString() text!: string;
    @IsString() room!: string;
    @IsInteger() ts!: number;
}

@Schema()
class RoomEvent {
    @IsString() room!: string;
    @IsString() user!: string;
    @IsString() action!: string;
}

const LobbyProtocol = defineWebSocket('LobbyProtocol', '/lobby', {
    inbound: { join: JoinRoom, leave: LeaveRoom, send: SendMsg },
    outbound: { message: ChatMsg, event: RoomEvent },
});

// --- Per-connection state ---

interface LobbyState {
    username: string;
}

// --- Handler ---
// Note: a connection can join multiple rooms. Use one index entry per room.
// conn.indexes supports multiple values per index type via set/delete.

@WebSocketHandler(LobbyProtocol)
class LobbyHandler
    extends WebSocketHandlerBase<typeof LobbyProtocol, LobbyState>
    implements HandlerType<typeof LobbyProtocol, LobbyState>
{
    constructor(private readonly logger = injectLogger(LobbyHandler)) { super(); }

    onOpen(conn: WebSocketConnection<typeof LobbyProtocol, LobbyState>) {
        conn.state.username = CurrentUser.getOrThrow().name;
    }

    onJoin(data: JoinRoom, conn: WebSocketConnection<typeof LobbyProtocol, LobbyState>) {
        // Add index: this connection is in this room. One conn can have multiple room indexes.
        conn.indexes.set(`room:${data.room}`, true);

        this.hub.broadcastByIndex(LobbyProtocol, `room:${data.room}`, true,
            'event',
            { room: data.room, user: conn.state.username, action: 'joined' },
        );
    }

    onLeave(data: LeaveRoom, conn: WebSocketConnection<typeof LobbyProtocol, LobbyState>) {
        conn.indexes.delete(`room:${data.room}`);
    }

    onSend(data: SendMsg, conn: WebSocketConnection<typeof LobbyProtocol, LobbyState>) {
        // Send to all rooms this connection is in
        for (const [indexType] of conn.indexes) {
            if (!indexType.startsWith('room:')) continue;
            const room = indexType.slice(5);
            this.hub.broadcastByIndex(LobbyProtocol, indexType, true,
                'message',
                { from: conn.state.username, text: data.text, room, ts: Date.now() },
            );
        }
    }

    onClose(conn: WebSocketConnection<typeof LobbyProtocol, LobbyState>) {
        for (const [indexType] of conn.indexes) {
            if (!indexType.startsWith('room:')) continue;
            const room = indexType.slice(5);
            this.hub.broadcastByIndex(LobbyProtocol, indexType, true,
                'event',
                { room, user: conn.state.username, action: 'left' },
            );
        }
        // conn.indexes auto-cleaned on close
    }
}

// --- Other service using ConnectionHub ---

@Component()
class AnnouncementService {
    constructor(private readonly hub = inject(ConnectionHub)) {}

    /** O(1) broadcast to a room via index */
    announce(room: string, text: string) {
        this.hub.broadcastByIndex(LobbyProtocol, `room:${room}`, true,
            'message',
            { from: 'system', text, room, ts: Date.now() },
        );
    }

    getOnlineUsers(): string[] {
        return [...this.hub.of(LobbyProtocol)].map(c => c.state.username);
    }
}

// --- Bootstrap ---

@Component()
@Touch(LobbyHandler)
class MyApp {}

const app = await WebApplication.create(MyApp);
await app.start();
```
