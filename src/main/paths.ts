import os from "node:os";
import path from "node:path";

export function dataDir(): string {
  if (process.env.SAKURA_PET_DATA_DIR) return path.resolve(process.env.SAKURA_PET_DATA_DIR);
  return path.join(os.homedir(), ".config", "sakura-pet");
}
