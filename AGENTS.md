# AGENTS.md

> If a requested implementation conflicts with this document, this document takes priority.

## Project Setup

- **Monorepo**: pnpm workspaces, packages in `packages/`
- **Build**: `tsdown` (bundles JS + .d.ts into `dist/`)
- **Test**: `vitest` with SWC (`unplugin-swc`, `decoratorVersion: '2023-11'` for TC39 decorators)
- **Lint**: ESLint (flat config) + Prettier
- **TypeScript**: strict mode, ESNext, `type=module`, no `experimentalDecorators`
- **Commands**: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`

## Design Principles

Kavri is not a NestJS clone. These are non-negotiable:

1. **DI via default parameters** — `inject()` in constructor defaults. No parameter decorators, no
   `reflect-metadata`, no `emitDecoratorMetadata`.
2. **Synchronous inject** — `inject()` is always synchronous for consumers. Async resolution is
   internal (suspense-style). No `injectAsync()`, no `Promise<T>` wrappers.
3. **Typed metadata** — all decorators carry typed metadata via `createClassDecorator`/
   `createMethodDecorator`/`createFieldDecorator`. `Metadata.of()` reads any decorator's data. No
   parallel untyped metadata channels.
4. **Flat modules** — `@Import`/`@Inject`/`@Provide` for composition. No hierarchical containers, no
   module scoping.
5. **Explicit failures** — framework errors fail early with actionable messages. No silent
   fallbacks, no swallowed errors.

## Implementation Standards

Every change must include:

- **Code** — production code with precise types. Minimize `any` (keep it local with a comment when
  unavoidable). Use `#` private fields/methods instead of the `private` keyword. Mark global/static
  initializers and `.bind()` calls with `/* @__PURE__ */` for tree-shaking.
- **Tests** — target 100% coverage. Cover normal paths, error paths, edge cases, lifecycle ordering,
  concurrency. Justify any coverage gaps. Test behavior, not implementation details.
- **Documentation** — all exported APIs must have detailed multi-line JSDoc blocks (never
  single-line `/** ... */`) with `@param`, `@returns`, `@throws`, and `@example` where applicable.
  Document private/internal APIs where intent, invariants, or non-obvious behavior exists. Update
  design docs and README if public behavior changes. Do not document unimplemented behavior as
  existing.

## Error Design

- Use specific error classes (`InvalidInjectContextError`, `CircularDependencyError`, etc.)
- Messages must say what went wrong, what was involved, and how to fix it
- Never silently ignore: duplicate providers, invalid injection contexts, circular deps, malformed
  metadata, invalid lifecycle usage

## API Design

- Keep public API surface small. Justify every new export.
- Consistent naming, argument order, option shapes, error strategy across similar APIs.
- Breaking changes require explicit documentation, migration guidance, and updated examples.
- Do not export implementation details.

## Explicitly Forbidden

Unless the architecture is intentionally being redesigned:

- `reflect-metadata` or `emitDecoratorMetadata`
- parameter-decorator-driven DI
- `injectAsync()` or promise-valued injection as normal consumer API
- separate untyped metadata channels
- hierarchical container scoping
- silent framework error swallowing
- merging code without tests
- rewriting toward NestJS patterns

## Decision Priority

When multiple designs are possible:

1. Kavri philosophy alignment
2. Conceptual consistency
3. Type safety
4. Correctness and testability
5. Maintainability
6. Performance
7. Implementation convenience

## Working Style

1. **If a request seems unreasonable, point it out and ask for confirmation before proceeding.** Do
   not silently follow instructions that may be mistakes, oversights, or technically problematic.
2. Verify the request doesn't conflict with Kavri's design — if it does, explain and propose
   alternatives
3. Find the smallest correct implementation
4. Implement with tests and documentation
5. After completing a task, summarize: what changed, what tests were added, what docs were updated,
   any remaining risks
