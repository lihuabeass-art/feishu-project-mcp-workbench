export function updaterConfig(options?: { env?: NodeJS.ProcessEnv; config?: { repository: string | null } }): { configured: boolean; endpoints: string[] };
export function withUpdaterConfig(args: string[], options?: { env?: NodeJS.ProcessEnv; config?: { repository: string | null } }): string[];
