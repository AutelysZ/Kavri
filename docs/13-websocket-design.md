# WebSocket Design

Package: `@kavri/web` — protocol definitions in `@kavri/schema`, client in `@kavri/client`.

## 1. Design principles

- **Protocol-first.** `defineWebSocket()` in `@kavri/schema` defines a typed bidirectional contract — shared between client and server, like `defineRoute`.
- **Handler = controller.** `createWebSocketHandler(protocol)` + `@WebSocketHandler()` mirrors `createController(route)` + `@Controller()`.
- **No stringly-typed dispatch.** Inbound message types map to handler methods by name. Greppable. Type-safe.
- **Per-connection AsyncContext.** `onOpen` runs in `AsyncContext.run()`. Message handlers `fork()` from it. Per-connection state works like per-request state.
- **Auth via HTTP interceptors.** The upgrade request flows through the HTTP interceptor chain (ROUTE → CORS → GUARD). No separate auth mechanism.

## 2. Protocol definition (`@kavri/schema`)

```ts
/**
 * Define a WebSocket protocol. Shared between client and server.
 * Inbound = client → server. Outbound = server → client.
 * Each key maps to a @Schema class.
 */
declare function defineWebSocket<
    TIn extends Record<string, AnyConstructor<any>>,
    TOut extends Record<string, AnyConstructor<any>>,
>(
    name: string,
    path: string,
    messages: { inbound: TIn; outbound: TOut },
): WebSocketProtocol<TIn, TOut>;

interface WebSocketProtocol<
    TIn extends Record<string, AnyConstructor<any>> = any,
    TOut extends Record<string, AnyConstructor<any>> = any,
> {
    readonly name: string;
    readonly path: string;
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

const ChatProtocol = defineWebSocket('ChatProtocol', '/chat/:roomId', {
    inbound: {
        send: SendMessage,
        typing: TypingEvent,
    },
    outbound: {
        message: ChatMessage,
        presence: UserPresence,
    },
});
```

## 3. Wire format

All messages are JSON frames with a `type` discriminant and `data` payload:

```json
{ "type": "send", "data": { "text": "hello" } }
```

Inbound messages are parsed and validated against the corresponding `@Schema` class before dispatch. Invalid messages receive an error frame:

```json
{ "type": "error", "data": { "message": "Validation failed", "issues": [...] } }
```

## 4. WebSocketConnection

```ts
interface WebSocketConnection<T extends WebSocketProtocol = any> {
    /** Unique connection ID. */
    readonly id: string;

    /** Path parameters extracted from the URL. */
    readonly params: Record<string, string>;

    /** Query string parameters from the upgrade URL. */
    readonly query: Record<string, string>;

    /** Send a typed outbound message. */
    send<K extends keyof T['outbound'] & string>(
        type: K,
        data: InstanceType<T['outbound'][K]>,
    ): void;

    /** Close the connection. */
    close(code?: number, reason?: string): void;
}
```

## 5. Handler (`@kavri/web`)

```ts
/**
 * Returns an abstract class with:
 * - Abstract methods for each inbound message key: on{PascalCase(key)}(data, conn)
 * - Optional lifecycle overrides: onOpen, onClose, onError
 * - Built-in: connections, broadcast, broadcastTo
 */
declare function createWebSocketHandler<T extends WebSocketProtocol>(
    protocol: T,
): abstract new () => WebSocketHandlerBase<T>;

abstract class WebSocketHandlerBase<T extends WebSocketProtocol> {
    /** All active connections. */
    readonly connections: ReadonlySet<WebSocketConnection<T>>;

    /** Send to all connections. */
    broadcast<K extends keyof T['outbound'] & string>(
        type: K,
        data: InstanceType<T['outbound'][K]>,
    ): void;

    /** Send to connections matching a predicate. */
    broadcastTo<K extends keyof T['outbound'] & string>(
        predicate: (conn: WebSocketConnection<T>) => boolean,
        type: K,
        data: InstanceType<T['outbound'][K]>,
    ): void;

    // --- Lifecycle (optional overrides) ---

    /** Called when a connection opens. Runs in AsyncContext.run(). */
    onOpen?(conn: WebSocketConnection<T>): Awaitable<void>;

    /** Called when a connection closes. */
    onClose?(conn: WebSocketConnection<T>, code: number, reason: string): Awaitable<void>;

    /** Called on connection error. */
    onError?(conn: WebSocketConnection<T>, error: Error): Awaitable<void>;
}

/**
 * Marks a class as a WebSocket handler. Composes @Component().
 * Registers the protocol's path for WebSocket upgrade routing.
 */
declare function WebSocketHandler(): ClassDecorator<{}>;
```

Example handler:

```ts
@WebSocketHandler()
class ChatHandler extends createWebSocketHandler(ChatProtocol) {
    constructor(
        private readonly repo = inject(MessageRepository),
        private readonly logger = injectLogger(ChatHandler),
    ) { super(); }

    // --- Lifecycle ---

    override onOpen(conn: WebSocketConnection<typeof ChatProtocol>) {
        const roomId = conn.params.roomId;
        this.logger.info('user joined room %s', roomId);
        // Set per-connection state via AsyncContext
        CurrentUser.set(kUser.getOrThrow()); // from auth interceptor during upgrade
    }

    override onClose(conn: WebSocketConnection<typeof ChatProtocol>) {
        const roomId = conn.params.roomId;
        this.broadcastTo(
            c => c.params.roomId === roomId && c.id !== conn.id,
            'presence',
            { userId: CurrentUser.getOrThrow().id, online: false },
        );
    }

    // --- Inbound message handlers (abstract, must implement) ---

    override onSend(data: SendMessage, conn: WebSocketConnection<typeof ChatProtocol>) {
        const user = CurrentUser.getOrThrow();
        const msg = { from: user.name, text: data.text, timestamp: Date.now() };

        this.repo.save(conn.params.roomId, msg);

        // Broadcast to all in same room
        this.broadcastTo(
            c => c.params.roomId === conn.params.roomId,
            'message',
            msg,
        );
    }

    override onTyping(data: TypingEvent, conn: WebSocketConnection<typeof ChatProtocol>) {
        // no-op or broadcast typing indicator
    }
}
```

Method naming: inbound key `send` → method `onSend`, key `typing` → method `onTyping`. Generated by `createWebSocketHandler` as abstract methods.

## 6. Per-connection AsyncContext

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

## 7. Upgrade flow

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
  → sets kEndpoint (WebSocket), kController (handler), kPathParams
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

HTTP interceptors run on the upgrade request up to `Interceptor.GUARD`. This means auth, CORS, rate limiting all work naturally. No duplicate auth logic.

## 8. Configuration

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

## 9. Client (`@kavri/client`)

```ts
import { createWebSocketClient } from '@kavri/client';

const ws = createWebSocketClient(ChatProtocol, { url: 'wss://example.com' });

// Typed send — only inbound message types allowed
ws.send('send', { text: 'hello' });
ws.send('typing', { typing: true });

// Typed receive — only outbound message types
ws.on('message', (data: ChatMessage) => {
    console.log(`${data.from}: ${data.text}`);
});
ws.on('presence', (data: UserPresence) => { ... });

// Lifecycle
ws.on('open', () => { ... });
ws.on('close', (code, reason) => { ... });
ws.on('error', (err) => { ... });

ws.close();
```

## 10. Server-side inject

```ts
@Component()
class NotificationService {
    constructor(private readonly chat = inject(ChatHandler)) {}

    async notifyRoom(roomId: string, message: ChatMessage) {
        this.chat.broadcastTo(
            c => c.params.roomId === roomId,
            'message',
            message,
        );
    }
}
```

## 11. Example: multi-room chat

```ts
import { Schema, IsString, IsBoolean, IsInteger, defineWebSocket } from '@kavri/schema';
import { WebSocketHandler, createWebSocketHandler, WebSocketConnection } from '@kavri/web';
import { Component, inject } from '@kavri/container';
import { injectLogger } from '@kavri/logging';

// --- Protocol (shared) ---

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

// --- Handler ---

@WebSocketHandler()
class LobbyHandler extends createWebSocketHandler(LobbyProtocol) {
    private rooms = new Map<string, Set<WebSocketConnection<typeof LobbyProtocol>>>();

    constructor(private readonly logger = injectLogger(LobbyHandler)) { super(); }

    override onJoin(data: JoinRoom, conn: WebSocketConnection<typeof LobbyProtocol>) {
        const room = this.rooms.get(data.room) ?? new Set();
        room.add(conn);
        this.rooms.set(data.room, room);
        for (const c of room) {
            c.send('event', { room: data.room, user: conn.id, action: 'joined' });
        }
    }

    override onLeave(data: LeaveRoom, conn: WebSocketConnection<typeof LobbyProtocol>) {
        this.rooms.get(data.room)?.delete(conn);
    }

    override onSend(data: SendMsg, conn: WebSocketConnection<typeof LobbyProtocol>) {
        // Find which rooms this connection is in, broadcast to all
        for (const [roomName, members] of this.rooms) {
            if (members.has(conn)) {
                for (const c of members) {
                    c.send('message', { from: conn.id, text: data.text, room: roomName, ts: Date.now() });
                }
            }
        }
    }

    override onClose(conn: WebSocketConnection<typeof LobbyProtocol>) {
        for (const [roomName, members] of this.rooms) {
            if (members.delete(conn)) {
                for (const c of members) {
                    c.send('event', { room: roomName, user: conn.id, action: 'left' });
                }
            }
        }
    }
}

// --- Bootstrap ---

@Component()
@Touch(LobbyHandler)
class MyApp {}

const app = await WebApplication.create(MyApp);
await app.start();
```
