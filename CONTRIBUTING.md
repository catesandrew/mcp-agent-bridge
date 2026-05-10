# Contributing

Thanks for your interest in contributing to MCP Agent Bridge! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/catesandrew/mcp-agent-bridge.git
cd mcp-agent-bridge

# Install dependencies
bun install

# Build
bun run build

# Run tests
bun run test

# Lint
bun run lint
```

## Project Structure

```
src/
├── shared/          # Shared types and server factory
├── claude/          # Claude MCP bridge + tests
├── codex/           # Codex MCP bridge + tests
└── copilot/         # Copilot MCP bridge + tests
bin/                 # Entry point scripts
examples/            # Platform-specific install examples
website/             # Docusaurus documentation site
```

## Making Changes

1. **Fork** the repository
2. **Create a branch** for your feature or fix
3. **Write tests** for new functionality
4. **Run the test suite** to ensure nothing is broken: `bun run test`
5. **Run the linter**: `bun run lint`
6. **Submit a pull request** with a clear description of your changes

## Code Style

- TypeScript with strict mode
- ES modules (ESM)
- No default exports for library code (entry points are fine)
- Keep dependencies minimal -- the project compiles to standalone binaries

## Testing

Tests use [Vitest](https://vitest.dev/) and are colocated with source files in `__tests__/` directories.

```bash
bun run test          # Single run
bun run test:watch    # Watch mode
```

## Documentation

The documentation site lives in `website/` and is built with [Docusaurus](https://docusaurus.io/).

```bash
cd website
npm install
npm start     # Dev server at http://localhost:3000
npm run build # Production build
```

## Reporting Issues

- Use [GitHub Issues](https://github.com/catesandrew/mcp-agent-bridge/issues)
- Include your OS, Node.js version, and Bun version
- Include relevant logs and error messages
- Describe what you expected vs. what happened

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
