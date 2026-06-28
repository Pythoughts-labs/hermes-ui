# Hermes UI

Electron desktop distribution for Hermes UI.

## Install

Download the latest macOS, Windows, or Linux installer for your CPU
architecture from the project
[GitHub Releases](https://github.com/Pythoughts-labs/hermes-ui/releases/latest).

The desktop app bundles the UI runtime and launches it locally from the
native shell app.

## Command shims

After the packaged desktop app starts, it installs managed command shims:

| Command | Description |
| --- | --- |
| `hermes-ui` | Open the Hermes UI desktop app |
| `hermes-ui cli ...` | Run the bundled Hermes Agent CLI |
| `hermes-ui web ...` | Run the bundled `hermes-ui` command |
| `hermes-ui -h` | Show wrapper help |
| `hermes-ui-mcp` | Run the managed UI MCP bridge |

Use `hermes-ui cli -h` for Hermes Agent CLI help and
`hermes-ui web -h` for UI CLI help.

## Data directories

Hermes Agent data is stored in the same platform-specific location as native
Hermes installs:

- Windows: `%LOCALAPPDATA%\hermes` (falls back to `%APPDATA%\hermes`)
- macOS/Linux: `~/.hermes`

The desktop wrapper's own UI state is stored separately in
`~/.hermes-ui` unless `HERMES_UI_HOME` is set.

## China mirror environment

These mirrors are optional and are not required in CI:

```sh
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

If GitHub release downloads are slow, `fetch-python.mjs` can also use a compatible
python-build-standalone release mirror:

```sh
export PBS_BASE_URL=https://github.com/astral-sh/python-build-standalone/releases/download
```
