# 樱

一个可以单独跑起来的三形态桌宠骨架。常态樱、黑樱、双人同框，形态只由你手动切换。Codex、DSH 或任何本机脚本只能改**当前形态里**的状态、表情和气泡。

形象是粉丝向的重新设计，用的是原创占位矢量，不是 Fate / TYPE-MOON 的官方素材，也不代表官方。双人构图参照「黑樱从身后环抱、贴耳、托脸、红苹果、影带」这个关系来摆：黑樱保护着软弱的自己。

## 和 dsh-pet 的关系

架构上的启发来自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（[PC2005-cloud](https://github.com/PC2005-cloud)，MIT，Copyright (c) 2026 PC2005-cloud）。

这个仓库**不是** dsh-pet 的分支，没有复制它的源码或素材。本仓库自己的代码也以 MIT 发布，见 `LICENSE`。若你去用 dsh-pet 本体，以那个仓库的许可证为准。

精神上对齐的是它的本机控制面：动作类接口回 `{ ok }`，画面以 `GET /state` 为准；`/state`、`/anim`、`/broadcast`、`/work-status` 都能用。另外挂了一份同形状的前缀 `/dsh-pet-7340`，方便照着 dsh-pet 的路径试。差异写在文末。

## 运行

需要 Node.js 22 或更新，以及一个桌面会话（Linux 下要有 `DISPLAY`）。中文界面用系统字体，Debian/Ubuntu 上如果缺字可以装 `fonts-noto-cjk`。

```bash
npm install
npm start
```

启动后会做三件事：

1. 在 `127.0.0.1:7341` 打开只对本机可见的 HTTP 接口（端口以配置为准）。
2. 在 `127.0.0.1:7342` 起一个渲染页，Electron 窗口加载它。
3. 打开一个透明、无边框、置顶的桌宠窗。

终端里会打印接口地址和配置文件路径。浏览器打开 <http://127.0.0.1:7342/> 能看到同一套桌宠，<http://127.0.0.1:7342/#/settings> 是设置页。真正的透明置顶窗是 Electron 那一扇。

如果报 `chrome-sandbox` 或 zygote 起不来：

```bash
SAKURA_PET_NO_SANDBOX=1 npm start
```

脚本在检测到内核不允许用户命名空间时会自己加上 `--no-sandbox`。

## 桌宠怎么用

- 拖空白处移动。松手后位置会记下来。
- 底栏切换形态。右键也有菜单。
- 数字键 `1` `2` `3` 换三个基本形态。第 4、第 5 槽启用之后才吃 `4` 和 `5`。
- 逗号键，或双击，打开设置。
- 右键「退出」关掉桌宠和接口。

状态条一直显示在画面下方：空闲、思考、工作中、等待、完成、出错，外加任务说明。换形态不会清掉这条状态，只是换成当前形态的表情和说法。

## 设置

设置页是一块宽的纸面，改完大约三分之一秒会写入磁盘，不用另点保存。

| 区块 | 作用 |
| --- | --- |
| 称呼 | 称谓默认「前辈」。昵称只在允许黑樱直呼时使用，留空则说「你」。 |
| 形态 | 当前形态、开机默认、五个槽的显示名。第 4、第 5 槽默认关闭。 |
| 语气 | 语气强度、敬语倾向、黑樱毒舌上限、是否允许直呼。 |
| 双人声部 | 黑樱占比，以及要不要同时出两个气泡。 |
| 人设补充 | 三个形态各一段自由文本，留空就用内置默认。预留槽也可以写，但没有立绘。 |
| 禁忌词 | 短台词和外部气泡里的这些词会换成 ※。 |
| 窗口与动画包 | 缩放、置顶、动画包路径。 |
| 适配器 | DSH / Codex / 通用 webhook 的开关。 |
| 智能对话 | OpenAI 兼容的接口地址、密钥、模型。状态短句不走模型。 |

内置人设只是默认值。补充文本会盖过它，并出现在 `GET /pet/config` 的 `effective` 里，给以后的对话适配器读。现在嘴上那几句短台词由语气旋钮决定，设置页里的「预听」用的是同一套函数，不会反过来改桌宠状态。

毒舌上限是天花板：语气强度不能把黑樱推过这个上限。双人默认黑樱占 70% 并且开着双气泡。关掉双气泡时，只留占比不低于一半的那一方；正好 50% 时由黑樱说。

开机时当前形态会回到「开机默认」，不会沿用上次停在哪一形态。

## 智能对话

状态气泡（空闲、思考、工作、等待、完成、出错，以及适配器事件没带 `text` 的时候）始终走 `src/shared/lines.ts` 里的短句，不会去请求模型。模型只在你主动问的时候用。

设置页「智能对话」：

1. 打开「启用智能对话」。
2. 提供方选「OpenAI 兼容」。以后要加别的提供方，只要在 `src/shared/llm.ts` 的注册表里补一个 `complete`，调用路径不用改。
3. **接口地址**填服务的 Base URL，例如 `https://api.openai.com/v1`、`https://api.deepseek.com`、`https://openrouter.ai/api/v1`，或本机 Ollama 的 `http://127.0.0.1:11434/v1`。末尾已是 `/v1` 就补 `/chat/completions`；已经写到 `/chat/completions` 就原样用；否则补 `/v1/chat/completions`。
4. **密钥**填 API Key。它只写进本机 `settings.json`（和别的设置同一个文件），不要提交，也不要写进仓库。程序不会在日志里打出密钥。本地服务如果并不校验密钥，可以填一个占位。
5. **模型**可留空，留空时按 OpenAI 兼容的默认 `gpt-4o-mini`。DeepSeek 填 `deepseek-chat`，Ollama 填本机模型名。
6. 「测试连接」发一个很小的请求，在设置页用中文显示结果。它不要求先打开开关，也不改桌宠气泡。
7. 「试对话」把当前形态的人设、称谓（以及允许直呼时的昵称）放进系统提示，只取回一句，显示在气泡里。

另外两处入口：桌宠右键菜单里的「问一句」；托盘菜单「试对话」会发送固定的「在吗」。这三处都要用户操作，工作状态接口碰不到模型。

没打开、没填密钥或接口地址、提供方不认识、或请求失败时，气泡改说「……这会儿说不了。」，工作状态保持不动，进程不退出。失败原因写在设置页的说明里，不写进密钥。

`POST /pet/llm/chat` 和 `POST /pet/llm/test` 都要用户头 `X-Sakura-User: 1`。`GET /pet/config` 会把这份本地配置原样交回给本机页面，设置页靠它回填密钥。接口仍然只绑在 `127.0.0.1`，不要转发到公网。

```bash
curl -sS -X POST http://127.0.0.1:7341/pet/llm/chat \
  -H 'content-type: application/json' \
  -H 'x-sakura-user: 1' \
  -d '{"message":"在吗"}'
```

## 配置文件

默认写在 `~/.config/sakura-pet/settings.json`。换地方：

```bash
SAKURA_PET_DATA_DIR=/你的目录 npm start
```

文件是完整的 schema（`schemaVersion: 1`），五个形态槽都在 `forms` 里。直接改这个文件会热加载。改 `api.port` 要重启。接口只绑定 `127.0.0.1`，不要把它转发到公网，这里没有鉴权。

手改文件可以改 `activeForm`。走 HTTP 时，改 `activeForm` / `defaultForm` 必须带用户头 `X-Sakura-User: 1`，设置页会带。agent 用的那几个接口不接受形态字段。

## 接 agent

统一事件是：

`idle` | `thinking` | `working` | `waiting` | `success` | `error`

别名会折进去。其中 `organizing` / `settling`（整理）在这个骨架里并进 `working`，因为 v0 没有第七个档。`normal`、`dark`、`duo`、`form4`、`form5` 若被当成状态或动作名，会得到 `form-switch-forbidden`，形态保持不动。

### 工作状态槽

和 dsh-pet 一样，这是外部槽，最后写入者生效，**不受适配器开关影响**。

```bash
curl -sS -X POST http://127.0.0.1:7341/pet/work-status \
  -H 'content-type: application/json' \
  -d '{"state":"working","task":"写一段说明"}'
```

等价路径：`POST /dsh-pet-7340/work-status`。

`DELETE /pet/work-status` 回到空闲。画面上的状态条会变，形态不变。

### 适配器事件

`POST /pet/events` 看设置里的开关。关掉对应适配器时返回 403 `adapter-disabled`，状态不动。

```bash
curl -sS -X POST http://127.0.0.1:7341/pet/events \
  -H 'content-type: application/json' \
  -d '{"source":"webhook","event":"waiting","task":"等确认"}'
```

`source` 取 `dsh`、`codex` 或 `webhook`。可选 `text` 会当成气泡；不写就用当前形态的人设短句。可选 `speaker` 为 `normal`、`dark` 或 `both`。

DSH 本体在 v0 没有接上。`src/main/adapters.ts` 里是映射表，以后的宿主把会话事件译成上面的 JSON 再投进来即可。

### Codex

Codex 的 `notify` 写在用户级 `~/.codex/config.toml` 的**顶层**，任何 `[table]` 之前。项目里的 `.codex/config.toml` 不会执行它。

```toml
notify = ["node", "/绝对路径/sakura-pet/examples/codex-notify.mjs"]
```

Codex 把 JSON 放在最后一个参数里，不是 stdin。目前这条通知只在 `agent-turn-complete` 时出现，脚本把它记成「完成」。任务摘要进状态条，气泡仍是桌宠自己的那句。脚本不传形态。

思考、工作、等待要用同一脚本另调：

```bash
node examples/codex-notify.mjs --event working --task "正在改桌宠"
node examples/codex-notify.mjs --event waiting --task "等你确认"
```

适配器关掉时脚本退出码是 2。更多 curl 在 `examples/curl-examples.sh`。

## HTTP

基址 `http://127.0.0.1:7341`。下面每条在 `/pet` 和 `/dsh-pet-7340` 下各有一份。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/health`、`/` | 名称、版本、端口、已运行秒数 |
| GET | `/state?since=&timeout=` | 唯一状态出口。`since` 与 `timeout` 成对出现时长轮询，timeout 上限 10 秒 |
| GET | `/config` | 用户配置加 `effective` 人设 |
| PUT | `/config` | 热更新。不带用户头时忽略 `activeForm` 和 `defaultForm` |
| POST | `/config/reset` | 恢复默认，保留窗口位置和端口。要用户头 |
| POST | `/form` | `{ "form": "duo" }`。要用户头。未启用的槽返回 409 |
| POST | `/work-status` | `{ "state", "task?" }` |
| DELETE | `/work-status` | 回到空闲，204 |
| POST | `/events` | `{ "source", "event", "task?", "text?", "speaker?" }` |
| POST | `/anim` | `{ "name?" , "url?" , "facing?" }`。`url` 只允许本机 `/pet/media/...` |
| GET | `/playback/{id}` | 点播回执。骨架只表示已收下，不追踪真实播放进度 |
| POST | `/broadcast` | `{ "text", "speaker?", "durationMs?" }`。`duration` 按秒。正文里用 `\|\|` 分成黑樱和樱两句 |
| POST | `/bubble/clear` | 收起气泡 |
| POST | `/llm/test` | 测试已保存的模型接口。要用户头。不改气泡，也不改工作状态 |
| POST | `/llm/chat` | `{ "message" }`。要用户头。回一句到气泡；失败时说本地短句。不改工作状态 |
| GET | `/pack` | 动画包和每个状态有没有替换素材 |
| POST | `/pack/reload` | 重新扫描。要用户头 |
| GET | `/media/{form}/{clip}` | 动画文件，序列在 `{clip}/01.png` 这种路径下 |

`GET /state` 的形状：

```json
{
  "counter": 12,
  "petId": "sakura",
  "sections": {
    "workStatus": { "counter": 8, "data": { "state": "working", "task": "写一段说明", "source": "work-status", "adapter": null } },
    "config": { "counter": 4, "data": { "activeForm": "duo", "defaultForm": "normal", "revision": 2 } }
  },
  "pets": {
    "sakura": {
      "say": { "counter": 9, "data": { "lines": [], "text": "", "form": "duo" } },
      "anim": { "counter": 10, "data": { "name": "working", "form": "duo", "playbackId": "pb_3" } }
    }
  }
}
```

叶子上的 `counter` 变了，就表示那一项变了。`anim.form` 只是「这句话是在哪个形态上说的」，渲染以 `sections.config.data.activeForm` 为准。

宠物 id 固定为 `sakura`。查询参数 `?pet=` 可以不写；写了就必须是 `sakura`。

## 动画包

默认包在 `packs/sakura/`，版本 0.1.1 已经带上三形态的待机和点击。画面按原型的构图重画：双人是黑樱从身后环抱、托脸、红苹果和影带；常态樱和黑樱是从同一个人设里拆出来的单人。这不是官方立绘。没有单独素材的状态先显示该形态的待机图，不再退回纯色占位。点桌宠（没有拖动）会播一遍 `click`，工作状态和形态都不变。

更多参考图放在 `packs/sakura/reference/`。那个目录只留说明，图片本身不进仓库。画完的序列放到：

```text
packs/sakura/animations/<形态>/<动作>/01.png
packs/sakura/animations/<形态>/<动作>/02.png
```

也可以放单个 `idle.webm`、`thinking.gif` 这类文件。动作名是 `idle`、`thinking`、`working`、`waiting`、`success`、`error`，外加点击用的 `click`。细节在 `packs/sakura/animations/README.md`。

设置里的「动画包路径」可以是相对应用根目录的路径，也可以是绝对路径。换了文件就点「重新扫描」。

## 自检

不打开窗口，只打接口：

```bash
npm run check
```

会确认：工作状态能改画面上的状态数据、不会改形态、形态切换要用户头、适配器开关会挡 `/events`、称谓和禁忌词会落盘、下次启动回到开机默认形态。智能对话默认关闭；就算打开了，工作状态也不会去请求模型。对话请求在自检里是模拟的，失败时气泡是「……这会儿说不了。」。

`npm run typecheck` 做类型检查。`npm run build` 产出 `dist/` 和 `dist-electron/`。平时用 `npm start`。

## 这个骨架还没有的

相对 dsh-pet，v0 故意没做这些：占用锁、余额、抛掷、睡觉、对话记忆、语音、多宠、屏幕漫游。智能对话只有你开口时的一轮，没有记忆，下一轮不会带上上一句。`/broadcast` 和 `/anim` 因此不需要 lock。成功和出错的气泡会留到下一次状态变化，而不是十秒后自己收起；广播可以用 `durationMs`（或按秒的 `duration`）到点后回到人设短句。对话那一句也会留到下一次状态变化，然后回到短句。

第 4、第 5 形态的 schema、目录和开关都在，启用后是一块「素材未绑定」的占位，不会长出新立绘。
