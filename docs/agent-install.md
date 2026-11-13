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

| Host | Global skill directory |
|---|---|
| opencode | `~/.config/opencode/skills/` |
| Claude Code | `~/.claude/skills/` |
| Other | Prefer the project-level `.opencode/skills/`; if that doesn't fit, ask the user |

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

```bash
mkdir -p ~/.config/opencode/skills/poe-wiki-cli      # opencode
mkdir -p ~/.claude/skills/poe-wiki-cli               # Claude Code
```

Write the downloaded content to `<the matching directory above>/SKILL.md`. Windows PowerShell example:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\skills\poe-wiki-cli" | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md" `
  -OutFile "$env:USERPROFILE\.config\opencode\skills\poe-wiki-cli\SKILL.md"
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md \
  -o ~/.config/opencode/skills/poe-wiki-cli/SKILL.md
```

### 2.2 Project-level install (applies to a single repository)

When the user explicitly says "this project only", write to the project root:

```
<repo>/.opencode/skills/poe-wiki-cli/SKILL.md
```

### 2.3 Install from local source

If the user cloned the repository for development, the skill is already there — just copy it, no download needed:

```bash
mkdir -p ~/.config/opencode/skills/poe-wiki-cli
cp skill/SKILL.md ~/.config/opencode/skills/poe-wiki-cli/SKILL.md
```

### 2.4 Verify

- The file exists and is non-empty;
- The first line is `---` and the frontmatter contains `name: poe-wiki-cli`;
- The file is roughly 13 KB. A large deviation means the download was truncated — download it again.

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
- Where the skill file was written
- **That the agent session must be restarted** before the skill is discovered
- Three common commands at most — do not paste the full documentation

---

## 4. Common failures

| Symptom | What to do |
|---|---|
| `poe-wiki-cli` not found | The global bin directory isn't on PATH. Use `npx -y poe-wiki-cli@latest`, or have the user restart the terminal |
| `doctor` reports poewiki as blocked (exit code 3) | Something on the network path is rewriting the User-Agent. Don't work around it by changing the UA yourself; tell the user first. This tool deliberately uses a non-Mozilla UA, which is what keeps Anubis from blocking it |
| npm installs very slowly | Switch to a mirror: `npm i -g poe-wiki-cli --registry=https://registry.npmmirror.com` |
| The agent doesn't recognize the skill after installation | Check for an extra directory level (it must be `skills/poe-wiki-cli/SKILL.md`) and confirm the session was restarted |

---

## 5. Do not

- Modify `SKILL.md` — neither its content nor its filename;
- Change the UA to `Mozilla/...` just to make a command work (poewiki's bot protection blocks it outright, and it misleads the user);
- Declare the installation successful without having run `doctor`.
