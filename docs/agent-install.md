# Automated poe-wiki-cli installation for agents

This document is written for **agents**. Human users only need to send the snippet from the README to their agent; the agent then follows the steps below.

There are two installation targets, and both are required:

1. The `poe-wiki-cli` command-line tool (runnable as-is)
2. The matching skill (so the agent knows when to use it and how)

---

## 0. Probe the environment first

```bash
node -v          # must be >= 20
poe-wiki-cli --version
```

- `node -v` below 20: stop, tell the user to upgrade Node.js, do not continue.
- `poe-wiki-cli --version` already prints a version: skip to step 2.
- Command not found: continue with step 1.

Also determine which host the current agent belongs to, because the skill install path differs:

| Host | Global skill directory | Project skill directory |
|---|---|---|
| opencode | `~/.config/opencode/skills/` or `~/.agents/skills/` | `.opencode/skills/` or `.agents/skills/` |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| OpenAI Codex | `~/.agents/skills/` | `.agents/skills/` |
| Cursor | `~/.cursor/skills/` or `~/.agents/skills/` | `.cursor/skills/` or `.agents/skills/` |
| Gemini CLI | `~/.gemini/skills/` or `~/.agents/skills/` | `.gemini/skills/` or `.agents/skills/` |
| GitHub Copilot (VS Code, Copilot CLI) | `~/.copilot/skills/` or `~/.agents/skills/` | `.github/skills/` |
| Any other host | Check the host's own docs; many also read `~/.agents/skills/`. If you cannot confirm, ask the user | Same rule under the project root |

`~/.agents/skills/` is the cross-client convention documented by the Agent Skills project (<https://agentskills.io>). Codex, Cursor, Gemini CLI and opencode scan it directly, and GitHub Copilot documents it alongside `~/.copilot/skills/`. One copy there therefore serves all of them; **Claude Code is the exception** — it does not scan that directory. For Claude Code use `~/.claude/skills/`, or `.claude/skills/` inside the project.

Install the skill once per host. When several hosts read `~/.agents/skills/`, that single copy counts for all of them.

Before writing, check the other directories this host scans (the table above) for an existing `poe-wiki-cli/SKILL.md` — for example an older opencode install in `~/.config/opencode/skills/`. If one exists, update it in place or ask the user which copy to keep; do not leave two. A stale copy in a higher-precedence directory can silently win: opencode prefers `~/.config/opencode/skills/` over `~/.agents/skills/`, and Claude Code prefers `~/.claude/skills/` over a project `.claude/skills/`.

On Windows, `~` means `%USERPROFILE%`.

---

## 1. Install the CLI

Prefer a global install:

```bash
npm i -g poe-wiki-cli
```

If npm reports `EACCES` / insufficient permissions, do **not** force it with `sudo`; use the no-install path instead:

```bash
npx -y poe-wiki-cli@latest --version
```

Once `npx` is in play, every subsequent command must be prefixed with `npx -y poe-wiki-cli@latest`, and you must tell the user this at the end.

If npm returns `E404` (the package isn't published yet), install from source instead, and have the user confirm the code directory:

```bash
git clone https://github.com/sage-z-cn/poe-wiki-cli.git
cd poe-wiki-cli
npm install
npm run build
npm link          # or: npm i -g .
```

Run a self-check immediately after installing:

```bash
poe-wiki-cli doctor
```

Expect every site to report `ok`. If the poewiki entry reports "blocked", read step 4 before deciding whether that counts as a failure.

---

## 2. Install the skill

The skill is a single `SKILL.md`. **Its content must land on disk verbatim — do not edit it, trim it, or add to it.**

Download URL (same repository as this document):

```
https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md
```

### 2.1 Global install (recommended; available to all projects)

Use the global directory for your host from step 0 (where a row lists two, either works). `SKILL_DIR` below stands for that path; the examples use `~/.agents/skills`, the shared location. Claude Code must substitute `~/.claude/skills`.

macOS / Linux:

```bash
SKILL_DIR=~/.agents/skills          # Claude Code: ~/.claude/skills
mkdir -p "$SKILL_DIR/poe-wiki-cli"
curl -fsSL https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md \
  -o "$SKILL_DIR/poe-wiki-cli/SKILL.md"
```

Windows PowerShell:

```powershell
$skillDir = "$env:USERPROFILE\.agents\skills"   # Claude Code: "$env:USERPROFILE\.claude\skills"
New-Item -ItemType Directory -Force "$skillDir\poe-wiki-cli" | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md" `
  -OutFile "$skillDir\poe-wiki-cli\SKILL.md"
```

### 2.2 Project-level install (applies to a single repository)

When the user explicitly says "this project only", use the project directory for your host from step 0 and write to:

```
<repo>/<project skill directory>/poe-wiki-cli/SKILL.md
```

For example `<repo>/.agents/skills/poe-wiki-cli/SKILL.md` (Codex, Cursor, Gemini CLI), `<repo>/.claude/skills/poe-wiki-cli/SKILL.md` (Claude Code), or `<repo>/.github/skills/poe-wiki-cli/SKILL.md` (GitHub Copilot).

### 2.3 Install from local source

If the user cloned the repository for development, the skill is already there — copy it to the same directory, no download needed.

macOS / Linux:

```bash
SKILL_DIR=~/.agents/skills          # Claude Code: ~/.claude/skills
mkdir -p "$SKILL_DIR/poe-wiki-cli"
cp skill/SKILL.md "$SKILL_DIR/poe-wiki-cli/SKILL.md"
```

Windows PowerShell:

```powershell
$skillDir = "$env:USERPROFILE\.agents\skills"   # Claude Code: "$env:USERPROFILE\.claude\skills"
New-Item -ItemType Directory -Force "$skillDir\poe-wiki-cli" | Out-Null
Copy-Item skill\SKILL.md "$skillDir\poe-wiki-cli\SKILL.md"
```

### 2.4 Verify

- The file exists and is non-empty;
- The first line is `---` and the frontmatter contains `name: poe-wiki-cli`;
- The directory matches the host's row in step 0 — Claude Code will not pick up a skill placed under `~/.agents/skills/`;
- The file is at least 20 KB (the current version is about 22 KB). A smaller file means the download was truncated — download it again.

---

## 3. Acceptance

Actually run it; don't just check that the files exist:

```bash
poe-wiki-cli doctor
poe-wiki-cli search fireball --limit 2
poe-wiki-cli league --realm cn
poe-wiki-cli search fireball --game poe2 --limit 1
```

All of these should return normally. If `league` reports "no league cards parsed", the poedb homepage layout has changed: follow the fallback guidance in the skill and read `--html` manually, and state the parsing failure explicitly in your report.

Finally, tell the user:

- The CLI version and how it was installed (global / npx / source)
- Which host you targeted and the exact path where the skill file was written
- **That the agent session must be restarted** before the skill is discovered
- Three common commands at most — do not paste the full documentation

---

## 4. Common failures

| Symptom | What to do |
|---|---|
| `poe-wiki-cli` not found | The global bin directory isn't on PATH. Use `npx -y poe-wiki-cli@latest`, or have the user restart the terminal |
| `doctor` reports poewiki as blocked (exit code 3) | Something on the network path is rewriting the User-Agent. Don't work around it by changing the UA yourself; tell the user first. This tool deliberately uses a non-Mozilla UA, which is what keeps Anubis from blocking it |
| npm installs very slowly | Switch to a mirror: `npm i -g poe-wiki-cli --registry=https://registry.npmmirror.com` |
| The agent doesn't recognize the skill after installation | Check three things: the directory matches this host's row in step 0 (for example Claude Code cannot see `~/.agents/skills/`), there is no extra directory level (it must be `skills/poe-wiki-cli/SKILL.md`), and the session was restarted |

---

## 5. Do not

- Modify `SKILL.md` — neither its content nor its filename;
- Change the UA to `Mozilla/...` just to make a command work (poewiki's bot protection blocks it outright, and it misleads the user);
- Install duplicate copies for the same host, or put the skill in a path you guessed for a host that isn't in step 0 — ask the user instead;
- Declare the installation successful without having run `doctor`.
