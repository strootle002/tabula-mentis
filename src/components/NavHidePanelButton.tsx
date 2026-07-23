import { useAppStore } from "../store/appStore";
import { CollapseIcon } from "./navIcons";

/** Labeled control to collapse the list panel (rail stays). */
export function NavHidePanelButton() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  return (
    <button
      type="button"
      className="nav-hide-btn"
      title="Hide navigation panel"
      aria-label="Hide navigation panel"
      onClick={toggleSidebar}
    >
      <CollapseIcon />
      <span>Hide</span>
    </button>
  );
}
