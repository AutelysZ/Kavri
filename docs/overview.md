# Kavri Design Overview

Kavri is a TypeScript IoC framework centered on explicit `inject(...)`-style dependency wiring.

## Design priorities

1. **Explicit dependency graph** — no `reflect-metadata` requirement.
2. **Strong provider model** — components, tokens, selectors, registries.
3. **Config-first integration** — config can control provider selection safely.
4. **Simple entry, scalable architecture** — one-container quick start and moduleized growth path.
5. **Optional HTTP layer** — built on top of IoC; IoC is fully usable standalone.

## Documentation map

- [`ioc.md`](./ioc.md): complete IoC core design and API
- [`config.md`](./config.md): first-class configuration model
- [`moduleize.md`](./moduleize.md): module composition and packaging strategy
- [`http.md`](./http.md): HTTP framework upper layer design

## Current focus

Current design focus is **IoC completeness**. Other documents are aligned with IoC decisions.
