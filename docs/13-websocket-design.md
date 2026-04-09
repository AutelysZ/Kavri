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
): WebSocketDefinition<TIn, TOut>;

interface WebSocketDefinition<
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

const ChatDef = defineWebSocket('ChatDef', { path: '/chat/:roomId', request: ChatParams }, {
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
const GameDef = defineWebSocket('GameDef', { path: '/game', codec: 'msgpack' }, {
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
/**
 * TReq is inferred from WebSocketOptions.request.
 * If request schema is provided, params is typed as InstanceType<request>.
 * Otherwise, params is Record<string, string>.
 */
interface WebSocketConnection<T extends WebSocketDefinition = any> {
    /** Unique connection ID. */
    readonly id: string;

    /**
     * Validated request params (path + query merged, parsed via request schema).
     * Typed when options.request is provided, otherwise Record<string, string>.
     */
    readonly params: T['options'] extends { request: AnyConstructor<infer R> } ? R : Record<string, string>;

    /** Send a typed outbound message. Schema data is validated and encoded via the codec. */
    send<K extends keyof T['outbound'] & string>(
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;

    /** Close the connection. */
    close(code?: number, reason?: string): void;
}
```

## 5. ConnectionHub

Manages connections for a WebSocket definition. Separate from the handler so other services can broadcast without injecting the handler (avoids circular dependencies).

**Handlers and controllers should never be injected by application code.**

```ts
class ConnectionHub<T extends WebSocketDefinition = any> {
    /** All active connections. */
    readonly connections: ReadonlySet<WebSocketConnection<T>>;

    /** Send to all connections. */
    broadcast<K extends keyof T['outbound'] & string>(
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;

    /** Send to connections matching a predicate. */
    broadcastTo<K extends keyof T['outbound'] & string>(
        predicate: (conn: WebSocketConnection<T>) => boolean,
        type: K,
        data: T['outbound'][K] extends 'binary' ? Uint8Array : InstanceType<T['outbound'][K]>,
    ): void;
}
```

A `ConnectionHub` is auto-registered per `@WebSocketHandler(def)`, named after the definition. Inject by qualifier:

```ts
@Component()
class NotificationService {
    constructor(private readonly chatHub = inject(ConnectionHub, 'ChatDef')) {}

    async notifyRoom(roomId: string, message: ChatMessage) {
        this.chatHub.broadcastTo(
            c => c.params.roomId === roomId,
            'message',
            message,
        );
    }
}
```

## 6. Handler

```ts
/**
 * HandlerType maps a WebSocketDefinition's inbound messages to handler methods.
 * For each inbound key K:
 *   type = 'binary'  → on{Capitalize<K>}(data: Uint8Array, conn): Awaitable<void>
 *   type = class      → on{Capitalize<K>}(data: InstanceType<class>, conn): Awaitable<void>
 */
type HandlerType<T extends WebSocketDefinition> = {
    [K in keyof T['inbound'] as `on${Capitalize<string & K>}`]: /* typed handler method */
};

/**
 * Base class for WebSocket handlers. Provides lifecycle hooks and
 * access to the ConnectionHub.
 */
abstract class WebSocketHandlerBase<T extends WebSocketDefinition> {
    constructor(protected readonly hub = inject(ConnectionHub, /* def.name */)) {}

    /** Called when a connection opens. Runs in AsyncContext.run(). */
    onOpen?(conn: WebSocketConnection<T>): Awaitable<void>;

    /** Called when a connection closes. */
    onClose?(conn: WebSocketConnection<T>, code: number, reason: string): Awaitable<void>;

    /** Called on connection error. */
    onError?(conn: WebSocketConnection<T>, error: Error): Awaitable<void>;
}

/**
 * Marks a class as a WebSocket handler. Composes @Component().
 * Registers the definition's path for WebSocket upgrade routing.
 * Auto-registers a ConnectionHub named after the definition.
 */
declare function WebSocketHandler<T extends WebSocketDefinition>(
    def: T,
): ClassDecorator<{ def: T }>;
```

Example handler:

```ts
@WebSocketHandler(ChatDef)
class ChatHandler
    extends WebSocketHandlerBase<typeof ChatDef>
    implements HandlerType<typeof ChatDef>
{
    constructor(
        private readonly repo = inject(MessageRepository),
        private readonly logger = injectLogger(ChatHandler),
    ) { super(); }

    // --- Lifecycle ---

    onOpen(conn: WebSocketConnection<typeof ChatDef>) {
        // conn.params is typed as ChatParams — roomId: string, token?: string
        this.logger.info('user joined room %s', conn.params.roomId);
        CurrentUser.set(kUser.getOrThrow()); // from auth interceptor during upgrade
    }

    onClose(conn: WebSocketConnection<typeof ChatDef>) {
        this.hub.broadcastTo(
            c => c.params.roomId === conn.params.roomId && c.id !== conn.id,
            'presence',
            { userId: CurrentUser.getOrThrow().id, online: false },
        );
    }

    // --- Inbound message handlers (required by HandlerType) ---

    onSend(data: SendMessage, conn: WebSocketConnection<typeof ChatDef>) {
        const user = CurrentUser.getOrThrow();
        const msg = { from: user.name, text: data.text, timestamp: Date.now() };

        this.repo.save(conn.params.roomId, msg);

        this.hub.broadcastTo(
            c => c.params.roomId === conn.params.roomId,
            'message',
            msg,
        );
    }

    onTyping(data: TypingEvent, conn: WebSocketConnection<typeof ChatDef>) {
        // broadcast typing indicator
    }

    onUpload(data: Uint8Array, conn: WebSocketConnection<typeof ChatDef>) {
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

const ws = createWebSocketClient(ChatDef, { url: 'wss://example.com' });

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

const LobbyDef = defineWebSocket('LobbyDef', '/lobby', {
    inbound: { join: JoinRoom, leave: LeaveRoom, send: SendMsg },
    outbound: { message: ChatMsg, event: RoomEvent },
});

// --- Handler ---

@WebSocketHandler(LobbyDef)
class LobbyHandler
    extends WebSocketHandlerBase<typeof LobbyDef>
    implements HandlerType<typeof LobbyDef>
{
    private rooms = new Map<string, Set<WebSocketConnection<typeof LobbyDef>>>();

    constructor(private readonly logger = injectLogger(LobbyHandler)) { super(); }

    onJoin(data: JoinRoom, conn: WebSocketConnection<typeof LobbyDef>) {
        const room = this.rooms.get(data.room) ?? new Set();
        room.add(conn);
        this.rooms.set(data.room, room);
        for (const c of room) {
            c.send('event', { room: data.room, user: conn.id, action: 'joined' });
        }
    }

    onLeave(data: LeaveRoom, conn: WebSocketConnection<typeof LobbyDef>) {
        this.rooms.get(data.room)?.delete(conn);
    }

    onSend(data: SendMsg, conn: WebSocketConnection<typeof LobbyDef>) {
        for (const [roomName, members] of this.rooms) {
            if (members.has(conn)) {
                for (const c of members) {
                    c.send('message', { from: conn.id, text: data.text, room: roomName, ts: Date.now() });
                }
            }
        }
    }

    onClose(conn: WebSocketConnection<typeof LobbyDef>) {
        for (const [roomName, members] of this.rooms) {
            if (members.delete(conn)) {
                for (const c of members) {
                    c.send('event', { room: roomName, user: conn.id, action: 'left' });
                }
            }
        }
    }
}

// --- Other service using ConnectionHub ---

@Component()
class AnnouncementService {
    constructor(private readonly lobbyHub = inject(ConnectionHub, 'LobbyDef')) {}

    announce(room: string, text: string) {
        this.lobbyHub.broadcastTo(
            c => true, // all connections
            'message',
            { from: 'system', text, room, ts: Date.now() },
        );
    }
}

// --- Bootstrap ---

@Component()
@Touch(LobbyHandler)
class MyApp {}

const app = await WebApplication.create(MyApp);
await app.start();
```
