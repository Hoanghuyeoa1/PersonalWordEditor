import { commandRegistry } from "./commandRegistry.ts";
import { DEFAULT_COMMANDS } from "./defaultCommands.ts";

// Tự động đăng ký các lệnh mặc định vào Registry Singleton
if (commandRegistry.getAll().length === 0) {
  commandRegistry.registerAll(DEFAULT_COMMANDS);
}

export * from "./types.ts";
export * from "./commandRegistry.ts";
export * from "./defaultCommands.ts";
export * from "./commandExecution.ts";
