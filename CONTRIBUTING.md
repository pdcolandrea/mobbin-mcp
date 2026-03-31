# Contributing to mobbin-mcp

Thanks for your interest in contributing! Here's how to get started.

## Development setup

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/pdcolandrea/mobbin-mcp.git
cd mobbin-mcp
npm install
```

2. Authenticate with Mobbin:

```bash
npx tsx src/index.ts auth
```

3. Run the server in dev mode (auto-restarts on changes):

```bash
npm run dev
```

## Making changes

1. Fork the repo and create a branch from `master`
2. Make your changes in `src/`
3. Verify the build passes: `npm run build`
4. Open a pull request

## Project structure

```
src/
  index.ts            # Server entry point and tool registration
  constants.ts        # API URLs and config
  types.ts            # TypeScript interfaces
  cli/auth.ts         # CLI authentication flow
  services/auth.ts    # Token management and refresh
  services/api-client.ts  # Mobbin API client
  utils/formatting.ts # Response formatters
```

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (TypeScript strict mode)
- Test your changes against the Mobbin API before submitting

## Reporting issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
