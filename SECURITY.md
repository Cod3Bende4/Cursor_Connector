# Security policy

## Supported versions

Security fixes are applied to the **default branch** (`main`) when practical. There are no separate LTS branches for this small utility project.

## Reporting a vulnerability

**Please do not** file a public GitHub issue for security-sensitive reports.

Instead:

1. Open a **private vulnerability report** via GitHub:  
   **Repository → Security → Report a vulnerability**  
   (GitHub [private reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) must be enabled on the repo; if unavailable, contact the maintainer via GitHub profile.)

2. Include: affected component, steps to reproduce, impact, and suggested fix if you have one.

We will acknowledge receipt as soon as we can and coordinate a fix and disclosure timeline.

## Scope

In scope: this repository’s Node bridge code, scripts, and documented configuration paths.

Out of scope: third-party services (Telegram, Cursor), macOS itself, or issues caused by leaked bot tokens or misconfigured `.env` files (rotate tokens and revoke access if exposed).
