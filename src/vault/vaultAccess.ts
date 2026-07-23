import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Convert an explicit folder-picker grant into a recursive vault-only grant.
 * Rust verifies the path is already present in the dialog-created scope.
 */
export async function trustSelectedVault(path: string): Promise<string> {
  if (!isTauri()) return path;
  return invoke<string>("trust_selected_vault", { path });
}

/**
 * Restore the Rust-owned canonical vault grant. No renderer-provided path is
 * accepted, so changing plugin-store data cannot expand filesystem access.
 */
export async function reopenTrustedVault(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("reopen_trusted_vault");
}
