export interface ReleaseNotes {
  version: string;
  tag: string | null;
  previousTag: string | null;
  commit: string | null;
  date: string | null;
  markdown: string;
}
interface Options { cwd?: string; env?: Record<string, string | undefined>; }
export function compareVersions(left: string, right: string): number;
export function generateReleaseNotes(options?: Options & { version?: string; tag?: string; previousTag?: string }): ReleaseNotes;
export function appReleaseNotes(options?: Options): ReleaseNotes;
export function loadBuildReleaseNotes(options?: Options): ReleaseNotes;
export function writeReleaseArtifacts(options?: Options & { output?: string }): { notes: ReleaseNotes; notesFile: string };
