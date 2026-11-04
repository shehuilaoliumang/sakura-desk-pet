#!/usr/bin/env node
// Codex notify → sakura-pet.
//
// Codex 的 notify 目前只在 agent-turn-complete 时启动这条命令，
// 并把一条 JSON 当作最后一个参数传进来（不是 stdin）。
// 这个脚本把它记成「完成」，任务摘要进状态条，气泡仍走桌宠自己的人设。
// 它不会发送形态字段。
//
// ~/.codex/config.toml 的顶层（要写在任何 [table] 之前）：
//   notify = ["node", "/绝对路径/examples/codex-notify.mjs"]
//
// 思考 / 工作 / 等待要另外调用，例如：
//   node examples/codex-notify.mjs --event working --task "正在改桌宠"
//   node examples/codex-notify.mjs --event waiting --task "等你确认"

const args = process.argv.slice(2);
let base = process.env.SAKURA_PET_URL || "http://127.0.0.1:7341";
let eventFlag = "";
let taskFlag = "";
let payload = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--event") eventFlag = args[++i] ?? "";
  else if (arg === "--task") taskFlag = args[++i] ?? "";
  else if (arg === "--url") base = args[++i] ?? base;
  else if (arg.trim().startsWith("{")) payload = JSON.parse(arg);
}

if (!eventFlag && payload && typeof payload.type === "string") eventFlag = payload.type;
if (!eventFlag) {
  console.error("sakura-pet: 缺少事件。Codex 应传入 JSON，或自己加 --event。");
  process.exit(1);
}

const task = taskFlag || clip(payload?.["last-assistant-message"] || payload?.["input-messages"]?.[0] || "");

const response = await fetch(`${base.replace(/\/$/, "")}/pet/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    source: "codex",
    event: eventFlag,
    task,
  }),
  signal: AbortSignal.timeout(3000),
});

const body = await response.json().catch(() => ({}));
if (response.status === 403) {
  console.error("sakura-pet: Codex 适配器已关闭。到设置里打开，或改用 POST /pet/work-status（外部槽，不受适配器开关影响）。");
  process.exit(2);
}
if (!response.ok) {
  console.error(`sakura-pet: ${response.status} ${body.reason || "请求失败"}`);
  process.exit(1);
}
console.error(`sakura-pet: ${body.state} ← ${eventFlag}（形态仍是 ${body.activeForm}）`);

function clip(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= 80 ? text : `${text.slice(0, 79)}…`;
}
