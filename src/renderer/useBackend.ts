import { useEffect, useState } from "react";
import { isPollAbort, pollErrorMessage } from "@shared/pollError";
import type { ConfigResponse, PublicState, ResolvedPack, Settings } from "@shared/types";

export interface Backend {
  settings: Settings | null;
  state: PublicState | null;
  pack: ResolvedPack | null;
  styles: ConfigResponse["styles"];
  paths: ConfigResponse["paths"] | null;
  api: ConfigResponse["api"] | null;
  warning: string | null;
  error: string | null;
}

export function useBackend(): Backend {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [pack, setPack] = useState<ResolvedPack | null>(null);
  const [styles, setStyles] = useState<ConfigResponse["styles"]>([]);
  const [paths, setPaths] = useState<ConfigResponse["paths"] | null>(null);
  const [api, setApi] = useState<ConfigResponse["api"] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let stopped = false;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const applyConfig = (config: ConfigResponse) => {
      setSettings(config.settings);
      setPaths(config.paths);
      setApi(config.api);
      setWarning(config.warning);
      setStyles(config.styles ?? []);
    };

    (async () => {
      let since = -1;
      let seenRevision = -1;
      let live = false;
      let failures = 0;
      while (!stopped) {
        try {
          if (since < 0) {
            const [configRes, stateRes, packRes] = await Promise.all([
              fetch("/pet/config", { signal: ctrl.signal }),
              fetch("/pet/state", { signal: ctrl.signal }),
              fetch("/pet/pack", { signal: ctrl.signal }),
            ]);
            if (!configRes.ok || !stateRes.ok || !packRes.ok) throw new Error("boot");
            const config = (await configRes.json()) as ConfigResponse;
            const nextState = (await stateRes.json()) as PublicState;
            const nextPack = (await packRes.json()) as ResolvedPack;
            if (stopped) return;
            applyConfig(config);
            setState(nextState);
            setPack(nextPack);
            setError(null);
            live = true;
            failures = 0;
            since = nextState.counter;
            seenRevision = nextState.sections.config.data.revision;
          }

          const res = await fetch(`/pet/state?since=${since}&timeout=8000`, { signal: ctrl.signal });
          if (!res.ok) throw new Error(`state ${res.status}`);
          const next = (await res.json()) as PublicState;
          if (stopped) return;
          if (next.counter < since) {
            since = -1;
            continue;
          }
          since = next.counter;
          setState(next);
          setError(null);
          live = true;
          failures = 0;
          const revision = next.sections.config.data.revision;
          if (revision !== seenRevision) {
            seenRevision = revision;
            const [configRes, packRes] = await Promise.all([
              fetch("/pet/config", { signal: ctrl.signal }),
              fetch("/pet/pack", { signal: ctrl.signal }),
            ]);
            if (!configRes.ok || !packRes.ok) throw new Error("config");
            if (stopped) return;
            applyConfig((await configRes.json()) as ConfigResponse);
            setPack((await packRes.json()) as ResolvedPack);
          }
        } catch (err) {
          if (stopped || ctrl.signal.aborted) return;
          const aborted = isPollAbort(err);
          if (!aborted) failures += 1;
          const message = pollErrorMessage(live, failures, aborted);
          // One dropped poll while the figure is up is the window resizing
          // under a form switch. Keep the picture and try again quietly.
          if (message) {
            console.warn("[sakura-pet] backend", err);
            setError(message);
          }
          since = -1;
          await sleep(live ? 300 : 1000);
        }
      }
    })();

    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, []);

  return { settings, state, pack, styles, paths, api, warning, error };
}
