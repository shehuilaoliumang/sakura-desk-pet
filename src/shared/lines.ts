import type { FormId, PetEvent, Settings, Speaker, SpeechLine } from "./types";

type Tier = 0 | 1 | 2;

type BandLine = { band: Tier; text: string };

function at(band: Tier, text: string): BandLine {
  return { band, text };
}

/**
 * `band` is the quietest tier that may say the line.
 * A higher tone or snark cap still keeps the quieter lines, and adds the sharper ones.
 * Each eligible pool is shuffled once, then dealt in order, so the same status varies
 * and does not repeat until the pool has been used.
 */
const NORMAL: Record<PetEvent, readonly BandLine[]> = {
  idle: [
    at(0, "……{{honorific}}，我在的。"),
    at(0, "{{honorific}}，我在。"),
    at(0, "我在旁边，{{honorific}}。"),
    at(0, "……{{honorific}}，小声就好。"),
    at(1, "{{honorific}}，我就在这儿。您不用特地看我。"),
    at(1, "{{honorific}}，我就在旁边。不吵您。"),
    at(1, "{{honorific}}……有事就轻轻叫我。"),
    at(1, "我陪着您，{{honorific}}。您先忙自己的。"),
    at(1, "{{honorific}}，我没有走开。不用回头找。"),
    at(2, "{{honorific}}……我就在旁边。想起来的话，小声叫我就好。"),
    at(2, "{{honorific}}，您要是累了，我就这样安静陪着。"),
    at(2, "……{{honorific}}。有事的话，我听得见。"),
  ],
  thinking: [
    at(0, "让我慢慢想，{{honorific}}。"),
    at(0, "{{honorific}}，我想想。"),
    at(0, "……{{honorific}}，再等一下。"),
    at(0, "{{honorific}}，我在想。"),
    at(1, "让我想一想，{{honorific}}。不会让您等太久。"),
    at(1, "{{honorific}}，请给我一小会儿。我想仔细一点。"),
    at(1, "{{honorific}}，这件事我放在心上想。"),
    at(1, "我想顺着理一理，{{honorific}}。很快的。"),
    at(2, "请给我一点点时间，{{honorific}}。我想仔细些，免得说错。"),
    at(2, "{{honorific}}，我怕说快了就说错。请再等我一下。"),
    at(2, "{{honorific}}……让我把话在心里过一遍，再告诉您。"),
  ],
  working: [
    at(0, "{{honorific}}，我在做。"),
    at(0, "等我一下，{{honorific}}。"),
    at(0, "{{honorific}}，手上还在做。"),
    at(0, "我慢慢做，{{honorific}}。"),
    at(1, "{{honorific}}，请稍等。我想把它做好。"),
    at(1, "{{honorific}}，我这就去做。您先不用盯着。"),
    at(1, "交给我吧，{{honorific}}。我会轻手轻脚做完。"),
    at(1, "{{honorific}}，我在认真做。做好了叫您。"),
    at(2, "正在做，{{honorific}}。做好了，我就轻声告诉您。"),
    at(2, "{{honorific}}，请让我做到整齐。我不想给您添乱。"),
    at(2, "{{honorific}}，我一步一步来。完成时轻轻说一声。"),
  ],
  waiting: [
    at(0, "{{honorific}}，我等着。"),
    at(0, "不急的，{{honorific}}。"),
    at(0, "{{honorific}}，您先忙。"),
    at(0, "我在等，{{honorific}}。不催。"),
    at(1, "{{honorific}}，我不着急。您先忙就好。"),
    at(1, "我等您，{{honorific}}。多久都可以。"),
    at(1, "{{honorific}}，您忙完再来找我。我还在。"),
    at(1, "{{honorific}}，我把位置留给您。不催的。"),
    at(2, "我在等您，{{honorific}}。多久都没关系，请不要顾着我。"),
    at(2, "{{honorific}}，您不用为了我加快。我喜欢这样等。"),
    at(2, "{{honorific}}……我在这儿。您什么时候回来，我都在。"),
  ],
  success: [
    at(0, "{{honorific}}，好了。"),
    at(0, "太好了，{{honorific}}。"),
    at(0, "{{honorific}}……做成了。"),
    at(0, "结束了，{{honorific}}。"),
    at(1, "做好了，{{honorific}}。您看这样可以吗。"),
    at(1, "{{honorific}}，做好了。没有给您添麻烦吧。"),
    at(1, "{{honorific}}，完成了。我有一点高兴。"),
    at(1, "成了，{{honorific}}。您要是不满意，我再改。"),
    at(2, "做好了，{{honorific}}。没有添麻烦吧。我……有点高兴。"),
    at(2, "{{honorific}}，做好了。我小心翼翼的，希望您喜欢。"),
    at(2, "{{honorific}}……终于好了。谢谢您愿意等我。"),
  ],
  error: [
    at(0, "对不起，{{honorific}}。"),
    at(0, "{{honorific}}，是我不好。"),
    at(0, "对不起，{{honorific}}。我在。"),
    at(0, "{{honorific}}，出了点差错。"),
    at(1, "对不起，{{honorific}}。是我这边出了问题。"),
    at(1, "{{honorific}}，抱歉。我再看一看。"),
    at(1, "对不起，{{honorific}}。我没有做好。"),
    at(1, "{{honorific}}，让您担心了。我会补上的。"),
    at(2, "对不起，{{honorific}}。我再确认一次，不会就这么算了。"),
    at(2, "{{honorific}}，是我疏忽了。请让我再来一次。"),
    at(2, "对不起，{{honorific}}。我还守在这里，不会逃开。"),
  ],
};

const DARK_TITLED: Record<PetEvent, readonly BandLine[]> = {
  idle: [
    at(0, "{{name}}。我在这儿。"),
    at(0, "{{name}}。……还在。"),
    at(0, "人在。{{name}}。"),
    at(0, "{{name}}，没走。"),
    at(0, "{{name}}。不必找。"),
    at(1, "{{name}}。我在。没走开。"),
    at(1, "{{name}}，看我也还是这样。"),
    at(1, "不必回头，{{name}}。我在。"),
    at(1, "{{name}}。安静待着就行。"),
    at(2, "{{name}}。看也没用，我还在。"),
    at(2, "{{name}}。盯着，我也不会走。"),
    at(2, "看够了吗，{{name}}。人在。"),
  ],
  thinking: [
    at(0, "……{{name}}。等一下。"),
    at(0, "{{name}}，在想。"),
    at(0, "{{name}}。先别出声。"),
    at(0, "{{name}}，给我一会儿。"),
    at(1, "{{name}}，让我静一静。"),
    at(1, "{{name}}。在看这件事。"),
    at(1, "{{name}}，想完再说。别催。"),
    at(1, "{{name}}。脑子还在转。"),
    at(2, "{{name}}。别打断。想完了再说。"),
    at(2, "{{name}}。再插话，我就从头想。"),
    at(2, "{{name}}。这点安静，我还是要的。"),
  ],
  working: [
    at(0, "{{name}}，还在做。"),
    at(0, "{{name}}。手没停。"),
    at(0, "{{name}}，做着。"),
    at(0, "{{name}}。还早。"),
    at(1, "{{name}}，别催。快不了的。"),
    at(1, "{{name}}。在做。眼睛放回去。"),
    at(1, "{{name}}，催也多不出一双手。"),
    at(1, "{{name}}。进度在走。别敲。"),
    at(2, "{{name}}。催也快不了。越催越乱。"),
    at(2, "{{name}}。再催，我就故意慢。"),
    at(2, "{{name}}。做完之前，别在旁边数。"),
  ],
  waiting: [
    at(0, "{{name}}，我等着。"),
    at(0, "{{name}}。人在。"),
    at(0, "{{name}}，你先忙。"),
    at(0, "{{name}}。不催。"),
    at(1, "急什么，{{name}}。我还在等。"),
    at(1, "{{name}}。你去也行，我守着。"),
    at(1, "{{name}}，多久都行。别道歉。"),
    at(1, "{{name}}。位置还给你留着。"),
    at(2, "{{name}}。急也没用。我守着。"),
    at(2, "{{name}}。你去忙。我不会先走。"),
    at(2, "{{name}}。等你这件事，我做得来。"),
  ],
  success: [
    at(0, "成了，{{name}}。"),
    at(0, "{{name}}。结束。"),
    at(0, "{{name}}，好了。"),
    at(0, "{{name}}。收工。"),
    at(1, "{{name}}。结束了。没什么好谢的。"),
    at(1, "{{name}}。做成了。不用谢。"),
    at(1, "{{name}}，过了。别太惊讶。"),
    at(1, "{{name}}。行了。那口气我听见了。"),
    at(2, "成了。{{name}}用不着道谢。听见了。"),
    at(2, "{{name}}。成了。夸我，我也当没听见。"),
    at(2, "{{name}}。事情完了。人还在，别散。"),
  ],
  error: [
    at(0, "{{name}}，出岔子了。"),
    at(0, "{{name}}。出错了。"),
    at(0, "{{name}}，岔了。"),
    at(0, "{{name}}。有问题。"),
    at(0, "{{name}}，先别慌。"),
    at(1, "{{name}}。谁弄的。……先别急着认。"),
    at(1, "{{name}}，出错了。我看着呢。"),
    at(1, "{{name}}。先看断在哪。"),
    at(1, "{{name}}，这锅先别背。"),
    at(2, "出错了，{{name}}。别装没看见。"),
    at(2, "{{name}}。别装没看见。我已经看见了。"),
    at(2, "{{name}}。错了就错了。别把眼睛挪开。"),
  ],
};

const DARK_DIRECT: Record<PetEvent, readonly BandLine[]> = {
  idle: [
    at(0, "{{name}}。……我在。"),
    at(0, "{{name}}，在这儿。"),
    at(0, "{{name}}。没走。"),
    at(0, "还在。{{name}}。"),
    at(0, "{{name}}，别找。"),
    at(1, "我在。{{name}}，没走开。"),
    at(1, "{{name}}，不用回头。"),
    at(1, "{{name}}。人就在旁边。"),
    at(1, "{{name}}，看一眼就行。"),
    at(2, "看什么。{{name}}，我还在。"),
    at(2, "{{name}}。盯着也赶不走。"),
    at(2, "{{name}}，看也没用。"),
  ],
  thinking: [
    at(0, "等一下。{{name}}。"),
    at(0, "{{name}}，在想。"),
    at(0, "{{name}}。安静。"),
    at(0, "{{name}}，先别出声。"),
    at(1, "静一静。{{name}}。"),
    at(1, "{{name}}，我在想。别插话。"),
    at(1, "{{name}}。看完再说。"),
    at(1, "在看。{{name}}，先别催。"),
    at(2, "别打断。{{name}}，还没想完。"),
    at(2, "{{name}}。再吵，我就重想。"),
    at(2, "{{name}}，想完了再理你。"),
  ],
  working: [
    at(0, "还在做。{{name}}。"),
    at(0, "{{name}}，手没停。"),
    at(0, "{{name}}。做着。"),
    at(0, "早呢。{{name}}。"),
    at(1, "别催。{{name}}，快不了。"),
    at(1, "{{name}}，在做。别敲。"),
    at(1, "{{name}}。催不出第二双手。"),
    at(1, "看着做呢。{{name}}。"),
    at(2, "催也快不了。{{name}}，越催越乱。"),
    at(2, "{{name}}。再催我就更慢。"),
    at(2, "{{name}}，急也得排队。"),
  ],
  waiting: [
    at(0, "等你。{{name}}。"),
    at(0, "{{name}}，我在。"),
    at(0, "{{name}}。不催。"),
    at(0, "你去。{{name}}，我留着。"),
    at(1, "急什么。{{name}}，我还在等。"),
    at(1, "{{name}}，多久都行。"),
    at(1, "{{name}}。别道歉，人还在。"),
    at(1, "我守着。{{name}}。"),
    at(2, "急也没用。{{name}}，我守着。"),
    at(2, "{{name}}。忙完再回来。"),
    at(2, "{{name}}，我不会先走。"),
  ],
  success: [
    at(0, "成了。{{name}}。"),
    at(0, "{{name}}，结束了。"),
    at(0, "{{name}}。好了。"),
    at(0, "收工。{{name}}。"),
    at(1, "结束了。{{name}}，没什么好谢。"),
    at(1, "{{name}}，成了。谢就免了。"),
    at(1, "{{name}}。行了，别一惊一乍。"),
    at(1, "{{name}}，我听见了。不用说。"),
    at(2, "用不着谢。{{name}}，我听见了。"),
    at(2, "{{name}}。夸也晚了。事情成了。"),
    at(2, "{{name}}，成了。人留下。"),
  ],
  error: [
    at(0, "出岔子了，{{name}}。"),
    at(0, "{{name}}，出错了。"),
    at(0, "{{name}}。岔了。"),
    at(0, "{{name}}，先别慌。"),
    at(0, "有问题。{{name}}。"),
    at(1, "谁弄的。{{name}}，先别认。"),
    at(1, "{{name}}，出错了。我看着。"),
    at(1, "{{name}}。这锅先别背。"),
    at(1, "{{name}}，看哪里断了。"),
    at(2, "出错了。别装没看见，{{name}}。"),
    at(2, "{{name}}。别装没看见。"),
    at(2, "{{name}}，错了就看着。别躲。"),
  ],
};

const ECHO: Record<PetEvent, readonly BandLine[]> = {
  idle: [
    at(0, "……嗯。我在。"),
    at(0, "我在旁边。"),
    at(0, "不打扰。"),
    at(0, "……陪着。"),
    at(0, "小声就好。"),
    at(0, "我没走。"),
    at(1, "{{honorific}}，我陪着。"),
    at(1, "{{honorific}}，我就在。"),
    at(1, "在您身边，{{honorific}}。"),
    at(1, "{{honorific}}，不吵您。"),
    at(1, "{{honorific}}……我在的。"),
  ],
  thinking: [
    at(0, "我也慢慢想。"),
    at(0, "让我想想。"),
    at(0, "再等一下。"),
    at(0, "我在想……"),
    at(0, "不急，慢慢来。"),
    at(0, "想一想。"),
    at(1, "再想一下，{{honorific}}。"),
    at(1, "{{honorific}}，我再想想。"),
    at(1, "请等我一下，{{honorific}}。"),
    at(1, "{{honorific}}，很快想好。"),
  ],
  working: [
    at(0, "马上就好。"),
    at(0, "我在做。"),
    at(0, "等我一下。"),
    at(0, "慢慢做好。"),
    at(0, "还在做。"),
    at(0, "我来。"),
    at(1, "我来做好，{{honorific}}。"),
    at(1, "{{honorific}}，我在做了。"),
    at(1, "请稍等，{{honorific}}。"),
    at(1, "{{honorific}}，交给我。"),
  ],
  waiting: [
    at(0, "我不急。"),
    at(0, "我等着。"),
    at(0, "先去忙。"),
    at(0, "不催。"),
    at(0, "我还在。"),
    at(0, "等多久都行。"),
    at(1, "我等您，{{honorific}}。"),
    at(1, "{{honorific}}，不着急。"),
    at(1, "{{honorific}}，我等着。"),
    at(1, "您先忙，{{honorific}}。"),
  ],
  success: [
    at(0, "……太好了。"),
    at(0, "做好了。"),
    at(0, "成了。"),
    at(0, "我好高兴。"),
    at(0, "结束了。"),
    at(0, "没出错。"),
    at(1, "做好了，{{honorific}}。太好了。"),
    at(1, "{{honorific}}，做成了。"),
    at(1, "太好了，{{honorific}}。"),
    at(1, "{{honorific}}，没添麻烦。"),
  ],
  error: [
    at(0, "是我不好。"),
    at(0, "对不起。"),
    at(0, "我再看看。"),
    at(0, "抱歉……"),
    at(0, "是我的错。"),
    at(0, "我还在。"),
    at(1, "对不起，{{honorific}}。"),
    at(1, "{{honorific}}，是我不好。"),
    at(1, "{{honorific}}，我再来。"),
    at(1, "抱歉，{{honorific}}。"),
  ],
};

type Deck = { order: number[]; cursor: number };

const decks = new Map<string, Deck>();

function shuffle(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = order[index];
    order[index] = order[swap] ?? index;
    order[swap] = current ?? swap;
  }
  return order;
}

function eligible(lines: readonly BandLine[], tier: Tier): readonly BandLine[] {
  const pool = lines.filter((line) => line.band <= tier);
  return pool.length > 0 ? pool : lines;
}

function pick(key: string, lines: readonly BandLine[], tier: Tier): string {
  const pool = eligible(lines, tier);
  const id = `${key}:${tier}:${pool.length}:${pool[0]?.text ?? ""}:${pool[pool.length - 1]?.text ?? ""}`;
  let deck = decks.get(id);
  if (!deck || deck.order.length !== pool.length) {
    deck = { order: shuffle(pool.length), cursor: 0 };
    decks.set(id, deck);
  }
  if (deck.cursor >= deck.order.length) {
    const last = deck.order[deck.order.length - 1];
    deck.order = shuffle(pool.length);
    if (pool.length > 1 && deck.order[0] === last) {
      const second = deck.order[1];
      deck.order[1] = deck.order[0] ?? 0;
      deck.order[0] = second ?? 0;
    }
    deck.cursor = 0;
  }
  const index = deck.order[deck.cursor] ?? 0;
  deck.cursor += 1;
  return pool[index]?.text ?? "";
}

function clampTier(n: number): Tier {
  if (n <= 0) return 0;
  if (n >= 2) return 2;
  return 1;
}

function normalTier(settings: Settings): Tier {
  let tier: Tier = settings.tone.intensity < 34 ? 0 : settings.tone.intensity < 74 ? 1 : 2;
  if (settings.tone.politeness < 25) tier = 0;
  if (settings.tone.politeness > 80 && tier === 0) tier = 1;
  return tier;
}

function darkTier(settings: Settings): Tier {
  const cap: Tier = settings.snarkCap <= 33 ? 0 : settings.snarkCap <= 66 ? 1 : 2;
  let tier = cap;
  if (settings.tone.intensity < 30) tier = clampTier(tier - 1);
  if (settings.tone.intensity > 75) tier = clampTier(tier + 1);
  return clampTier(Math.min(tier, cap));
}

function echoTier(settings: Settings): Tier {
  return settings.tone.politeness >= 60 ? 1 : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyTaboo(text: string, words: string[]): { text: string; filtered: boolean } {
  let next = text;
  let filtered = false;
  const sorted = [...words].filter((word) => word.trim()).sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    const pattern = new RegExp(escapeRegExp(word), "gi");
    if (!pattern.test(next)) continue;
    filtered = true;
    pattern.lastIndex = 0;
    next = next.replace(pattern, "※");
  }
  return { text: next, filtered };
}

function fill(template: string, settings: Settings, who: Speaker): string {
  const honorific = settings.honorific.trim() || "你";
  const nickname = settings.nickname.trim();
  const name = who === "dark" && settings.darkMayAddressDirectly ? nickname || "你" : honorific;
  return template.replaceAll("{{honorific}}", honorific).replaceAll("{{nickname}}", nickname || name).replaceAll("{{name}}", name);
}

function darkLine(settings: Settings, event: PetEvent): string {
  const table = settings.darkMayAddressDirectly ? DARK_DIRECT : DARK_TITLED;
  const who = settings.darkMayAddressDirectly ? "direct" : "titled";
  return fill(pick(`dark:${who}:${event}`, table[event], darkTier(settings)), settings, "dark");
}

function softLine(settings: Settings, event: PetEvent): string {
  return fill(pick(`normal:${event}`, NORMAL[event], normalTier(settings)), settings, "normal");
}

function echoLine(settings: Settings, event: PetEvent): string {
  return fill(pick(`echo:${event}`, ECHO[event], echoTier(settings)), settings, "normal");
}

function finish(lines: SpeechLine[], words: string[]): { lines: SpeechLine[]; text: string; filtered: boolean } {
  let filtered = false;
  const next = lines.map((line) => {
    const applied = applyTaboo(line.text, words);
    if (applied.filtered) filtered = true;
    return { ...line, text: applied.text };
  });
  return { lines: next, text: next.map((line) => line.text).join("\n"), filtered };
}

export function speakFor(settings: Settings, event: PetEvent, form: FormId): { lines: SpeechLine[]; text: string; filtered: boolean } {
  if (form === "form4" || form === "form5") {
    return finish(
      [{ speaker: "normal", text: "这个槽位还没有人设。", primary: true }],
      settings.tabooWords,
    );
  }
  if (form === "normal") {
    return finish([{ speaker: "normal", text: softLine(settings, event), primary: true }], settings.tabooWords);
  }
  if (form === "dark") {
    return finish([{ speaker: "dark", text: darkLine(settings, event), primary: true }], settings.tabooWords);
  }

  const share = settings.duoVoice.darkShare;
  const dual = settings.duoVoice.dualBubble;
  const showDark = share > 0 && (dual || share >= 50);
  const showSoft = share < 100 && (dual || share < 50);
  const darkPrimary = share >= 50;
  const lines: SpeechLine[] = [];
  if (showDark) lines.push({ speaker: "dark", text: darkLine(settings, event), primary: darkPrimary || !showSoft });
  if (showSoft) lines.push({ speaker: "normal", text: echoLine(settings, event), primary: !darkPrimary || !showDark });
  if (!lines.length) lines.push({ speaker: "dark", text: darkLine(settings, event), primary: true });
  return finish(lines, settings.tabooWords);
}

export function linesFromBroadcast(
  settings: Settings,
  form: FormId,
  text: string,
  speaker?: Speaker | "both",
): { lines: SpeechLine[]; text: string; filtered: boolean } {
  const parts = text.split("||").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return finish(
      [
        { speaker: "dark", text: parts[0] ?? "", primary: settings.duoVoice.darkShare >= 50 },
        { speaker: "normal", text: parts[1] ?? "", primary: settings.duoVoice.darkShare < 50 },
      ],
      settings.tabooWords,
    );
  }

  const body = parts[0] ?? text.trim();
  let who: Speaker;
  if (speaker === "normal" || speaker === "dark") who = speaker;
  else if (form === "normal") who = "normal";
  else if (form === "duo" && settings.duoVoice.darkShare < 50) who = "normal";
  else who = "dark";

  return finish([{ speaker: who, text: body, primary: true }], settings.tabooWords);
}
