# 让 agent 自动安装 poe-wiki-cli

这份文档是写给 **agent** 看的。人类用户只需要把 README 里那句话发给自己的 agent，agent 会按下面的步骤执行。

安装目标有两个，缺一不可：

1. 命令行工具 `poe-wiki-cli`（能直接跑）
2. 对应的 skill（让 agent 知道什么时候该用它、怎么用）

---

## 0. 先探测环境

```bash
node -v          # 需要 >= 20
poe-wiki-cli --version
```

- `node -v` 低于 20：停止，告诉用户升级 Node.js，不要继续。
- `poe-wiki-cli --version` 已经能输出版本号：跳到第 2 步。
- 命令不存在：继续第 1 步。

同时确认当前 agent 属于哪一种宿主，因为 skill 的安装路径不同：

| 宿主 | 全局 skill 目录 |
|---|---|
| opencode | `~/.config/opencode/skills/` |
| Claude Code | `~/.claude/skills/` |
| 其它 | 优先项目级 `.opencode/skills/`，找不到再问用户 |

Windows 下 `~` 即 `%USERPROFILE%`。

---

## 1. 安装 CLI

首选全局安装：

```bash
npm i -g poe-wiki-cli
```

如果 npm 报 `EACCES` / 权限不足，**不要**用 `sudo` 硬装，改用免安装方式：

```bash
npx -y poe-wiki-cli@latest --version
```

采用 `npx` 时，后面所有命令都要写成 `npx -y poe-wiki-cli@latest <子命令>`，并在最后告诉用户这一点。

如果 npm 返回 `E404`（包尚未发布），改用源码安装，并让用户确认代码目录：

```bash
git clone https://github.com/sage-z-cn/poe-wiki-cli.git
cd poe-wiki-cli
npm install
npm run build
npm link          # 或 npm i -g .
```

安装完成后立刻自检：

```bash
poe-wiki-cli doctor
```

期望两个站点都 `ok`。若 poewiki 一项报「被拦截」，先读第 4 步再决定是否算失败。

---

## 2. 安装 skill

skill 就是一份 `SKILL.md`，**内容必须原样落盘，不要改写、不要精简、不要自行补充**。

下载地址（与本文档同一个仓库）：

```
https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md
```

### 2.1 全局安装（推荐，所有项目可用）

```bash
mkdir -p ~/.config/opencode/skills/poe-wiki-cli      # opencode
mkdir -p ~/.claude/skills/poe-wiki-cli               # Claude Code
```

把下载到的内容写入 `<上面对应的目录>/SKILL.md`。Windows PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode\skills\poe-wiki-cli" | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md" `
  -OutFile "$env:USERPROFILE\.config\opencode\skills\poe-wiki-cli\SKILL.md"
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/sage-z-cn/poe-wiki-cli/refs/heads/main/skill/SKILL.md \
  -o ~/.config/opencode/skills/poe-wiki-cli/SKILL.md
```

### 2.2 项目级安装（只对某个仓库生效）

用户明确说「只在这个项目里用」时，写到项目根：

```
<repo>/.opencode/skills/poe-wiki-cli/SKILL.md
```

### 2.3 从本地源码安装

如果用户是 clone 下来开发的，skill 就在仓库里，直接复制即可，不必下载：

```bash
mkdir -p ~/.config/opencode/skills/poe-wiki-cli
cp skill/SKILL.md ~/.config/opencode/skills/poe-wiki-cli/SKILL.md
```

### 2.4 校验

- 文件存在且非空；
- 首行是 `---`，frontmatter 里有 `name: poe-wiki-cli`；
- 文件大小约 13 KB。相差太多说明下载被截断，重下。

---

## 3. 验收

真正跑一次，不要只看文件在不在：

```bash
poe-wiki-cli doctor
poe-wiki-cli search fireball --limit 2
poe-wiki-cli league --realm cn
poe-wiki-cli search fireball --game poe2 --limit 1
```

三条都应正常返回。`league` 若报「未解析到赛季卡片」，说明 poedb 首页改版了，按 skill 里的降级说明手工读 `--html`，并在汇报里明确指出解析失败。

最后告诉用户：

- CLI 版本号与安装方式（全局 / npx / 源码）
- skill 落盘路径
- **需要重启 agent 会话**，skill 才会被发现
- 常用命令三条即可，不要贴完整文档

---

## 4. 常见失败

| 现象 | 处理 |
|---|---|
| `poe-wiki-cli` 找不到 | 全局安装的 bin 目录不在 PATH，改用 `npx -y poe-wiki-cli@latest`，或让用户重启终端 |
| `doctor` 报 poewiki 被拦截（退出码 3） | 网络链路上有代理改写了 User-Agent。不要自己改 UA 绕，先告诉用户；本工具刻意用非 Mozilla UA 才不被 Anubis 拦 |
| npm 装包极慢 | 换镜像：`npm i -g poe-wiki-cli --registry=https://registry.npmmirror.com` |
| skill 装完 agent 不认 | 检查目录层级是否多了一层（必须是 `skills/poe-wiki-cli/SKILL.md`），并确认已重启会话 |

---

## 5. 不要做的事

- 不要修改 `SKILL.md` 的内容或文件名；
- 不要为了让命令跑通而把 UA 改成 `Mozilla/...`（会被 poewiki 的反爬直接挡掉，且会误导用户）；
- 不要在没跑过 `doctor` 的情况下就宣布安装成功。
