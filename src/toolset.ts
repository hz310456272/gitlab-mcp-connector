export interface ToolsetsConfig {
  enabledToolsets: Set<string>;
  isWriteEnabled: boolean;
}

export function resolveToolsets(raw: string | undefined): ToolsetsConfig {
  if (!raw || raw.trim().length === 0) {
    return { enabledToolsets: new Set(), isWriteEnabled: false };
  }

  const enabledToolsets = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  return {
    enabledToolsets,
    isWriteEnabled: enabledToolsets.has("write"),
  };
}

export function isWriteEnabled(config: ToolsetsConfig): boolean {
  return config.isWriteEnabled;
}
