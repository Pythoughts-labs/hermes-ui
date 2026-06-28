# Chat Sessions Chain Documentation

> Status: This document organizes the complete implementation chain for ordinary Chat sessions against the current `main`.
> The legacy independent CLI Chat panel, `/cli-chat-run` namespace, `cli-chat.ts` client, and Python bridge direct command layer are no longer product entry points.

> Last rebuild time: 2026-06-03.

> Maintenance requirements: subsequent PRs that modify the ordinary Chat chain core files listed in this document must add a standalone change fragment under `docs/chat-chain-changes/`. One change fragment per PR, clearly recording the modification time, PR/commit, affected functionality and behavior impact, to avoid conflicts when multiple PRs modify this document simultaneously. `packages/server/src/services/hermes/agent-bridge/` is the core chain for ordinary Chat; any change under that directory counts as a Chat chain change; even if it is only startup, environment variables, logging, or brand attribution, the scope of impact must be recorded, and "no change to runtime behavior" must be explicitly stated when necessary. `packages/server/src/services/hermes/group-chat/`, the `/group-chat` Socket.IO namespace, the group-chat frontend store/API/component, the shared compressor, and the context-engine also belong to the core chat chain, and changes must be recorded similarly.

> Maintenance note: When the website, reference docs, Hermes agent docs, and the current client UI differ, the manual treats the currently visible client interface as the operational source of truth. For future releases, update the documentation site scope.

This document is the operational source of truth for the ordinary Chat chain. It complements the in-tree TypeScript types and the `docs/chat-chain-changes/` fragments; keep it in sync with both.

## 1. TL;DR

The main chain of the current ordinary Chat is:

```text
ChatPanel / ChatInput
  -> Pinia chat store
  -> Socket.IO /chat-run (with bearer token auth)
  -> ChatRunSocket (server)
  -> AgentBridgeManager -> Python bridge broker
  -> Python agent run loop
  -> assistant/tool/reasoning deltas back through /chat-run
  -> chat store updates -> MessageItem render
```

In other words, current UI ordinary chat does not go through Hermes Gateway `/v1/responses`, but rather through `source=cli` of the Agent Bridge path. Code still retains `api_server` type and `handle-api-run.ts`, but `resolveRunSource()` currently always returns `cli`.

Core principles:

- The UI only has one ordinary Chat page; no separate CLI Chat page.
- All long-lived events uniformly go through `/chat-run`.
- All ordinary sessions land in UI own SQLite `sessions/messages` table.
- Hermes profile, model, provider, workspace, source are all session-level context.
- multiple tabs / page refresh via `resume` rejoins the same `session:{id}` room.
- The same session simultaneously only runs one active run; subsequent input enters the session queue.
- Tool approval, user clarification, compression, abort, usage, slash command all reuse the same `/chat-run` event channel.

### Recent chain change log

Change log is split by PR and saved in `docs/chat-chain-changes/`. Add a Chat session chain, Agent Bridge, compression or Group Chat core chain changes, add a fragment file; do not continue modifying this document maintained centralized table.

Each fragment at minimum contains:

```md
---
date: YYYY-MM-DD
pr: 1234
feature: changed feature
impact: behavior impact
---

Supplementary notes.
```

Before PR has number, can write first `pr: pending`; PR created then change that fragment to actual PR number.

## 2. main files

### frontend

| File | Responsibility |
| --- | --- |
| `packages/client/src/components/hermes/chat/ChatPanel.vue` | ordinary Chat page container, composes message list, input box, approval bar, clarification bar, drawer panel. |
| `packages/client/src/components/hermes/chat/ChatInput.vue` | input box, send, attachment, stop button entry. |
| `packages/client/src/components/hermes/chat/MessageList.vue` / `VirtualMessageList.vue` | message list rendering and virtual scrolling. |
| `packages/client/src/components/hermes/chat/MessageItem.vue` | single message rendering, contains assistant, tool, reasoning, attachment etc UI. |
| `packages/client/src/stores/hermes/chat.ts` | Chat core state machine: session list, send, resume, queue, streaming events, approval, clarification, abort, compression status. |
| `packages/client/src/api/hermes/chat.ts` | `/chat-run` Socket.IO client, handles connection, global event dispatch, run/resume/abort/approval/clarify protocol. |
| `packages/client/src/api/hermes/sessions.ts` | HTTP session API: list, detail pagination, delete, rename, model update. |
| `packages/client/src/api/hermes/group-chat.ts` | `/group-chat` Socket.IO client and group-chat HTTP room/agent/config API. |
| `packages/client/src/stores/hermes/group-chat.ts` | Group Chat state machine: rooms, members, messages, agents, streaming, context/compression status. |
| `packages/client/src/components/hermes/group-chat/*` | Group Chat page, input box, message list, member/agent display and room creation config. |

### backend

| File | Responsibility |
| --- | --- |
| `packages/server/src/services/hermes/run-chat/index.ts` | `ChatRunSocket`, `/chat-run` namespace entry, authentication, profile validation, run/resume/abort/approval/clarify/queue dispatch. |
| `packages/server/src/services/hermes/run-chat/handle-bridge-run.ts` | current main run path: create/update local session, build context, call Agent Bridge, consume bridge events, write to DB. |
| `packages/server/src/services/hermes/run-chat/handle-api-run.ts` | retained API Server path implementation; current `resolveRunSource()` always returns `cli`, normally does not reach here. |
| `packages/server/src/services/hermes/run-chat/session-command.ts` | slash command parsing and execution. |
| `packages/server/src/services/hermes/run-chat/abort.ts` | active run interruption, state persistence, queue handoff. |
| `packages/server/src/services/hermes/run-chat/compression.ts` | DB history building, snapshot-aware history, context compression. |
| `packages/server/src/services/hermes/run-chat/bridge-message.ts` | Bridge assistant/tool message in-memory state and DB flush. |
| `packages/server/src/services/hermes/run-chat/bridge-delta.ts` | filter bridge output tool call markers, avoid UI text duplicate or drop characters. |
| `packages/server/src/services/hermes/agent-bridge/client.ts` | Node to Python bridge local socket client. |
| `packages/server/src/services/hermes/agent-bridge/manager.ts` | Python bridge broker subprocess lifecycle management. |
| `packages/server/src/services/hermes/agent-bridge/python/hermes_bridge.py` | Python broker/worker entrypoint; implementation split into same directory `bridge_*.py` modules, covering `AIAgent` session pool, tool approval, clarification, compression collaboration, goal/plan commands etc. |
| `packages/server/src/services/hermes/group-chat/index.ts` | `/group-chat` Socket.IO server, room/member/message storage, agent resume, mention dispatch, approval/interrupt entry. |
| `packages/server/src/services/hermes/group-chat/agent-clients.ts` | Group Chat agent socket client, call Agent Bridge execute mentioned agent, and sync tool/reasoning/context status. |
| `packages/server/src/services/hermes/context-engine/*` | Group Chat context compression and summary cache. |
| `packages/server/src/lib/context-compressor/*` | shared by ordinary Chat and Group Chat token estimation, summary compression and context message processing. |
| `packages/server/src/routes/hermes/group-chat.ts` | Group Chat HTTP room/agent/config/compress/clear-context API. |
| `packages/server/src/db/hermes/session-store.ts` | UI local session/message SQLite storage. |
| `packages/server/src/controllers/hermes/sessions.ts` | HTTP session list, details, pagination, delete, import/export etc controller. |

## 3. data model

ordinary Chat uses UI local SQLite, while does not directly use Hermes CLI history as the only state. Core tables initialized by `packages/server/src/db/hermes/schemas.ts`.

### sessions

`session-store.ts` exposed main fields:

| Field | Description |
| --- | --- |
| `id` | UI session id. Generated on frontend new, passed when sending run. |
| `profile` | Hermes profile. New session uses current active profile, existing sessions prefer the profile in DB. |
| `source` | Current session source. Current ordinary Chat actually writes `cli`. Historical data may have `api_server`. |
| `model` / `provider` | session-bound model. First turn send writes selected model/provider, subsequent updates possible. |
| `title` / `preview` | session title and preview. Title can be changed by `/title`, can also be generated from first user input. |
| `workspace` | current working directory context, is injected into run instructions. |
| `message_count` / `tool_call_count` | counted from messages table by `updateSessionStats()`. |
| `input_tokens` / `output_tokens` | usage count result. |
| `last_active` / `started_at` / `ended_at` | session time metadata. |

### messages

Main roles:

| role | Description |
| --- | --- |
| `user` | ordinary user input. |
| `command` | user input slash command display message. |
| `assistant` | Agent output text, may carry `reasoning` / `reasoning_content`. |
| `tool` | tool execution result. |

Tool call related fields:

- `tool_call_id`
- `tool_calls`
- `tool_name`
- `finish_reason`
- `reasoning`
- `reasoning_details`
- `reasoning_content`

Frontend reads history via `mapHermesMessages()` to map DB rows to UI Message, including:

- assistant text message
- reasoning content
- visual rows for tool started/tool completed
- queue message
- command/system message

## 4. frontend state machine

`useChatStore()` is the central state of ordinary Chat.

Common states:

| State | Description |
| --- | --- |
| `sessions` | currently loaded session list and message array for each session. |
| `activeSessionId` / `activeSession` | session currently displayed on page. |
| `serverWorking` | frontend-tracked set of session ids with active server runs. |
| `streamStates` | sessions with registered streaming handlers in frontend. |
| `queueLengths` / queued user messages | server queue length and UI-visible queue message per session. |
| `pendingApprovals` | tool approval request, stored by sessionId + approvalId. |
| `pendingClarifies` | user clarification request, stored by sessionId + clarifyId. |
| `compressionStates` | temporary UI state during context compression. |
| `abortState` | interruption state of current active run. |

### new session

ordinary new session entrypoint ultimately calls:

```ts
newChat(options)
```

It will:

1. Creates a local frontend session object from current app model/profile state.
2. Switches to this session.
3. At this point DB may not yet have a session row, the actual DB write happens on first run.

Historical `newCliSession()` still exists, but ordinary Chat currently also source=cli, no longer needs a separate UI panel to distinguish.

### switch session

When switching sessions, the store prefers Socket.IO `resume`:

```ts
resumeSession(sessionId, onResumed, profile)
```

The server will:

1. `socket.join("session:<id>")`
2. If in-memory sessionMap has state, returns directly.
3. Otherwise reads paginated messages and usage from DB.
4. If this session is running, returns the latest transient events.

After frontend receives `resumed`, it will:

- Replace/fill local messages
- Restore `isWorking`, `isAborting`, queue, usage
- Re-register handlers for active run
- Re-display approval, clarification, compression, abort and other incomplete states

## 5. send message chain

### frontend send

Entry is `chat.ts` store's:

```ts
sendMessage(content, attachments?)
```

Main steps:

1. If there is no active session, create one first
2. Capture the sid at send time, subsequent callbacks all use this sid, avoid events writing to wrong session after user switches
3. Determine if slash command: `content.trim().startsWith("/")`
4. Determine whether queuing is needed

(This document is a high-level chain map. For implementation details, see the linked source files.)

## 6. `/chat-run` connection and authentication

All `/chat-run` connections go through:

1. Client opens Socket.IO with bearer token (auto-token or username/password JWT)
2. Server middleware validates the token, sets `socket.data.userId` and resolves the profile scope
3. Server joins `session:<id>` room after auth resolves successfully

The same connection also serves `/chat-run`'s resume/abort/approval/clarify handlers.

## 7. server-side run dispatch

### source flow

`resolveRunSource()` currently always returns `cli`. The `api_server` branch is retained for legacy compatibility but does not normally execute.

### sessionMap

The server keeps an in-memory `sessionMap` keyed by session id, holding the current run, the queue, the compression cache, the pending approval/clarify set, and the Socket.IO room membership. `resume` rebuilds it from DB when missing.

## 8. Bridge run detailed chain

### 8.1 initialized by run

`handle-bridge-run.ts` runs after auth/profile checks, and:

1. Persists the new message to DB
2. Resolves the runtime (Python bridge broker) via `AgentBridgeManager`
3. Builds the agent instructions, context, and provider config

### 8.2 instructions assemble

Instructions are composed from: profile name, role description, room name, member names, mode-specific rules, and snapshot-aware conversation history.

### 8.3 context build

`compression.ts` walks the messages, applies the snapshot-aware history filter, runs the token estimator, and triggers a compression pass when the threshold is exceeded.

### 8.4 call AgentBridgeClient

`AgentBridgeClient` opens (or reuses) a Unix socket / TCP connection to the Python broker, sends the run request, and consumes the event stream back into the chat store.

## 9. Python Agent Bridge

### 9.1 process structure

A Python `bridge_broker.py` is launched by Node, which in turn spawns per-profile worker processes (`bridge_worker.py`). The broker multiplexes multiple profile workers over a single local socket.

### 9.2 Node/Python protocol

The protocol is a newline-delimited JSON stream. Each event has a stable `kind` and a payload. See `bridge_*.py` for the schema.

### 9.3 commonly used action

`api`, `devices`, `use`. Each action is a separate MCP toolset exposed by `hermes-ui-mcp`.

## 10. streaming event map

### event map

The server maps bridge events into Socket.IO events emitted on `/chat-run`:

- `message.delta` -> text delta
- `message.reasoning` -> reasoning delta
- `tool.started` -> tool preview
- `tool.completed` -> tool result
- `message.completed` / `run.completed` / `run.failed`

### message write to DB

Final assistant/tool/reasoning content is flushed to DB on `run.completed` or on explicit snapshot boundaries.

## 11. run complete and failed

`run.completed` and `run.failed` are emitted by the server after the bridge reports back. The chat store updates `isWorking`, persists the final messages, clears pending approvals, and re-enables the input box.

## 12. queue

Each session has at most one active run. Subsequent `sendMessage` calls enqueue user input into `sessionMap[sessionId].queue` and are flushed in order when the current run ends.

## 13. Abort

`abort(sessionId)` cancels the in-flight bridge run, marks the active run as `aborted` in DB, and surfaces a synthetic `run.failed` event to the client.

## 14. tool approval

`/chat-run` exposes `approval.submit` so the client can approve or reject a pending tool call. The server resolves it and forwards the verdict to the bridge.

## 15. user clarification

Same as tool approval, but for `clarify.ask`. The bridge waits for the response before resuming.

## 16. Slash Commands

Slash commands are intercepted client-side, parsed, and dispatched via `session-command.ts` server-side. The most common commands: `/title`, `/compact`, `/clear`, `/resume`.

## 17. context compression

When `input_tokens + output_tokens` exceeds the model context window, `compression.ts` runs the configured compressor to summarize older messages while preserving tool calls and reasoning. The compressed snapshot is persisted alongside the original messages.

## 18. multiple tabs and disconnect restore

When the client loses its Socket.IO connection, the store caches outgoing `sendMessage` calls and flushes them on `reconnect`. The server uses the `resume` handshake to reconcile any out-of-order events.

## 19. HTTP Session API and Chat's relationship

The HTTP `/api/hermes/sessions/*` endpoints manage session metadata, while the Socket.IO `/chat-run` carries streaming chat traffic. They share the same SQLite tables and the same `sessionMap` lifecycle.

## 20. Group Chat chain

Group Chat reuses the bridge for each `@mentioned` agent. The server multiplexes multiple agent clients inside one room, sharing the context compressor and the session/message store.

## 21. startup and close

On startup the server initializes: SQLite, bridge manager (lazy), `sessionMap`, `/chat-run`, `/group-chat`, kanban events, global agent server, LAN discovery, MCP injection, model catalog cache, profile gateways. On shutdown it stops all of these in reverse order.

## 22. environment variables

See README.md and config.ts. Key vars: `PORT`, `BIND_HOST`, `HERMES_UI_HOME`, `AUTH_TOKEN`, `LOG_LEVEL`, `HERMES_AGENT_BRIDGE_*`, `HERMES_UI_DISABLE_MCP_AUTOINJECT`, `HERMES_OPENROUTER_APP_*`.

## 23. current limitations and precautions

- One active run per session; concurrent `sendMessage` is queued.
- Compression is best-effort; recent tool call results may be retained verbatim.
- Bridge subprocess restart may drop in-flight runs.
- Profile gateway auto-start is on by default; set `HERMES_UI_DISABLE_GATEWAY_AUTOSTART=1` to disable.

## 24. troubleshooting

- See `scripts/harness-check.mjs` for the documentation invariants this file must satisfy.
- Check `~/.hermes-ui/logs/` for server-side traces.
- Check `~/.hermes-ui/.token` for the auth token used by the client.
- Check `docs/chat-chain-changes/` for recent change fragments.
- Check `packages/server/src/services/hermes/agent-bridge/` for bridge code.
- Check `packages/server/src/services/hermes/group-chat/` for group-chat code.
- Check `packages/server/src/lib/context-compressor/` for compression code.
- Any change counts as a Chat chain change.
