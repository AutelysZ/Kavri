# Event System Design

## 1. Purpose

The event system provides decoupled pub/sub communication between components. It is built on the IoC
core and follows the same injection patterns. Components emit events without knowing who listens;
listeners react without coupling to the emitter.

## 2. Two event styles

### 2.1 Class-based events — `@EventType(name?)`

Event classes must be decorated with `@EventType()`. Emitting an undecorated class instance is a
runtime error — this prevents accidental dispatch of arbitrary objects.

```ts
declare function EventType(name?: string): ClassDecorator<{ name: string | undefined }>;
```

The optional `name` is used for logging, serialization, and debugging.

```ts

@EventType('order.created')
class OrderCreatedEvent {
    constructor(
        public readonly orderId: string,
        public readonly total: number,
    ) {
    }
}
```

### 2.2 Key-based events — `defineEvent<T>(name?)`

Lightweight typed events without defining a class. Use when the event payload is a simple data
shape.

```ts
declare class EventKey<T> {
    readonly name?: string;
    private readonly __brand: T;
}

declare function defineEvent<T>(name?: string): EventKey<T>;
```

```ts
const CacheInvalidated = defineEvent<{ key: string }>('cache.invalidated');
const ShutdownRequested = defineEvent<{ timeout: number }>('shutdown');
```

## 3. Listening — `@OnEvent(target)`

```ts
declare function OnEvent<T>(
  event: AnyConstructor<T> | EventKey<T>,
): MethodDecorator;
```

`@OnEvent` decorates a method in a `@Component()` class. The method is called when a matching event
is emitted. Listeners are invoked in dependency order (components resolved earlier are called
first).

```ts

@Component()
class OrderNotifier {
    @OnEvent(OrderCreatedEvent)
    async onOrderCreated(event: OrderCreatedEvent) {
        await sendEmail(event.orderId);
    }

    @OnEvent(CacheInvalidated)
    onCacheInvalidated(data: { key: string }) {
        clearLocalCache(data.key);
    }
}
```

## 4. Emitting — `EventBus`

```ts
declare class EventBus {
  /** Emit a class-based event. The class must be decorated with @EventType(). */
  emit<T extends object>(event: T): Promise<void>;
  /** Emit a key-based event with data. */
  emit<T>(key: EventKey<T>, data: T): Promise<void>;
}
```

`EventBus` is a built-in component. Inject it via `inject(EventBus)`.

`emit()` is async — it waits for all listeners to complete before returning.

## 5. Rules

- **`@EventType` is required** for class-based events. Emitting an undecorated class throws at
  runtime.
- **Listeners must be in `@Component()` classes.** The component must be imported/used in the
  container.
- **Listener invocation order** follows dependency order (components resolved first are called
  first).
- **Async listeners** are awaited. If a listener throws, `emit()` rejects.
- **No guaranteed ordering** between listeners at the same dependency level.
- **`EventBus` is singleton** — the same instance across the container.

## 6. Full example

```ts
import {
    Container,
    Component,
    Import,
    Use,
    EventType,
    OnEvent,
    EventBus,
    defineEvent,
    inject,
    token,
} from '@kavri/container';

// --- class-based events ---

@EventType('order.created')
class OrderCreatedEvent {
    constructor(
        public readonly orderId: string,
        public readonly total: number,
    ) {
    }
}

@EventType('order.shipped')
class OrderShippedEvent {
    constructor(public readonly orderId: string) {
    }
}

// --- key-based events ---

const CacheInvalidated = defineEvent<{ scope: string }>('cache.invalidated');

// --- listeners ---

@Component()
class AuditLogger {
    @OnEvent(OrderCreatedEvent)
    async onOrderCreated(ev: OrderCreatedEvent) {
        console.log(`audit: order ${ev.orderId} created, total=${ev.total}`);
    }

    @OnEvent(OrderShippedEvent)
    onOrderShipped(ev: OrderShippedEvent) {
        console.log(`audit: order ${ev.orderId} shipped`);
    }
}

@Component()
class CacheManager {
    private readonly cache = new Map<string, any>();

    @OnEvent(CacheInvalidated)
    onInvalidate(data: { scope: string }) {
        this.cache.delete(data.scope);
    }
}

@Component()
class InventoryService {
    @OnEvent(OrderCreatedEvent)
    async onOrderCreated(ev: OrderCreatedEvent) {
        console.log(`inventory: reserving stock for order ${ev.orderId}`);
    }
}

// --- emitter ---

@Component()
class OrderService {
    constructor(private readonly events = inject(EventBus)) {
    }

    async createOrder(id: string, total: number) {
        // ... persist order ...
        await this.events.emit(new OrderCreatedEvent(id, total));
        await this.events.emit(CacheInvalidated, {scope: 'orders'});
    }

    async shipOrder(id: string) {
        // ... update order status ...
        await this.events.emit(new OrderShippedEvent(id));
    }
}

// --- bootstrap ---

@Inject(AuditLogger, CacheManager, InventoryService)
class App {
    constructor(private readonly orders = inject(OrderService)) {
    }

    async run() {
        await this.orders.createOrder('o-1', 99.99);
        await this.orders.shipOrder('o-1');
    }
}

const container = new Container();
const app = await container.resolve(App);
await app.run();
await container.destroy();
```
