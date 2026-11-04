import { DEFAULT_PERSONA } from "./defaults";
import type { EffectivePersonas, FormId, Settings } from "./types";

export function materializePersona(template: string, settings: Settings): string {
  const honorific = settings.honorific.trim() || "你";
  const nickname = settings.nickname.trim() || honorific;
  return template.replaceAll("{{honorific}}", honorific).replaceAll("{{nickname}}", nickname).replaceAll("{{name}}", honorific);
}

export function effectivePersonas(settings: Settings): EffectivePersonas {
  const forms = {} as EffectivePersonas["forms"];
  for (const id of ["normal", "dark", "duo"] as const) {
    const override = settings.forms[id].persona.trim();
    forms[id] = {
      source: override ? "override" : "default",
      text: materializePersona(override || DEFAULT_PERSONA[id], settings),
    };
  }
  for (const id of ["form4", "form5"] as const) {
    const override = settings.forms[id].persona.trim();
    forms[id] = {
      source: override ? "override" : "empty",
      text: override ? materializePersona(override, settings) : "",
    };
  }
  return {
    honorific: settings.honorific.trim() || "你",
    nickname: settings.nickname.trim(),
    forms,
  };
}

export function personaSourceLabel(form: FormId, source: EffectivePersonas["forms"][FormId]["source"]): string {
  if (source === "override") return "正在使用补充人设";
  if (source === "empty") return "这个槽位还没有人设";
  return form === "form4" || form === "form5" ? "空槽" : "正在使用内置默认";
}
