export function resolveVersion(options?: {
  release?: boolean;
  cwd?: string;
  env?: Record<string, string | undefined>;
}): string;
export function versionFromTag(tag: string): string | null;
export function withVersionConfig(args: string[], version: string): string[];
