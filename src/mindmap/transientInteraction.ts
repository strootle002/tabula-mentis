export type TransientLinkingState = {
  linkingFromId: string | null;
  pendingLink: { fromId: string; toId: string } | null;
};

export function resolveTransientLinkingState(
  view: string,
  state: TransientLinkingState,
): TransientLinkingState {
  if (view === "map") return state;
  return { linkingFromId: null, pendingLink: null };
}
