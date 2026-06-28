# Contributing to Hermes UI

Thanks for your interest in improving Hermes UI. This is the short version;
[`DEVELOPMENT.md`](../DEVELOPMENT.md) has the full project rules and
[`ARCHITECTURE.md`](../ARCHITECTURE.md) explains the layout.

## Prerequisites

- Node.js >= 23
- npm

## Setup

```bash
npm install
npm run dev      # Vite client + Koa server together
```

## Before opening a PR

```bash
npm run harness:check   # repository invariants
npm run test            # unit tests
npm run build           # type-check + production build
```

For browser-visible changes, also run `npm run test:e2e`.

## Pull requests

- Branch from `main` (e.g. `feat/...`, `fix/...`).
- Keep commits focused — don't bundle unrelated changes.
- Describe what changed, why, and the validation you ran.
- Link issues with `Closes #123`.

See [`DEVELOPMENT.md`](../DEVELOPMENT.md) for coding, frontend, server, and
testing rules. By participating you agree to our
[Code of Conduct](./CODE_OF_CONDUCT.md).
