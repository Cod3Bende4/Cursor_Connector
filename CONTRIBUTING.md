# Contributing to Cursor Telegram Bridge

Thanks for your interest in contributing. This project is open source under the [MIT License](LICENSE).

## Branch policy (`main`)

- **Pull requests are required** for changes landing on `main` from collaborators and forks.
- The repository owner (**@Cod3Bende4**) is on the **bypass list** for the branch ruleset so they can push or merge without a PR when needed.
- Use a **feature branch** (`feat/…`, `fix/…`) and open a PR against `main` for anything you expect others to review.

If you use the GitHub CLI, you can check active rules with:

```bash
gh api repos/Cod3Bende4/Cursor_Connector/rulesets
```

## How to contribute

1. **Fork** the repository (for contributors without write access) or create a branch if you have access.
2. **Install** dependencies: `npm install` (Node 20+).
3. **Configure** a local `.env` from `.env.example` — **never commit** `.env`, tokens, or chat IDs.
4. **Run tests** before opening a PR:

   ```bash
   npm test
   ```

5. **Describe** your PR clearly: what changed, why, and how you verified it (manual test on macOS is common for this project).

## Scope

- Keep changes focused on the bridge (Telegram ↔ Cursor automation, capture, commands).
- Match existing code style and avoid large unrelated refactors in the same PR.

## Reporting issues

Use [GitHub Issues](https://github.com/Cod3Bende4/Cursor_Connector/issues). Choose the bug or feature template when possible.

## Security

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
