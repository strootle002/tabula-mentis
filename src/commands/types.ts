import type { AppState } from "../store/storeTypes";

export interface AppCommand {
  id: string;
  title: string;
  /** Grouping label shown next to the command in the palette. */
  section: string;
  keywords?: string[];
  /** Return false to hide the command for the given state. */
  when?: (state: AppState) => boolean;
  run: (state: AppState) => void | Promise<void>;
}
