# Contributing to Kavri

Kavri is opinionated. Please read this before opening a pull request.

## Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Core Principles

- DI via **default parameters**, not parameter decorators
- `inject()` is **synchronous** for consumers
- No `reflect-metadata` or `emitDecoratorMetadata`
- Decorators use a **typed metadata system**
- Modules are flat — no hierarchical containers

See [CLAUDE.md](./CLAUDE.md) for the full design contract.

## Requirements for Every Change

- **Tests** — target 100% coverage. Cover success, failure, and edge cases.
- **Documentation** — JSDoc on all exported APIs. Update docs/README if behavior changes.
- **Types** — precise types, minimize `any`.
- **Errors** — explicit, actionable. No silent fallbacks.

## Pull Request Checklist

- [ ] Preserves Kavri's design principles
- [ ] Tests cover normal, failure, and edge case paths
- [ ] All exports have JSDoc documentation
- [ ] Docs/examples updated if behavior changed
- [ ] No `reflect-metadata` or `emitDecoratorMetadata` introduced
- [ ] No undocumented public exports added

For AI coding agents: follow [CLAUDE.md](./CLAUDE.md).
