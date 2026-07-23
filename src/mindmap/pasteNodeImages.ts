/** Shared paste → node-image ingestion for canvas / panel text fields. */
import {
  clipboardHasNodeImage,
  collectClipboardImageFiles,
  collectClipboardImagePaths,
  readImagesFromClipboard,
} from "./nodeImages";
import { useAppStore } from "../store/appStore";

export function handleNodeImagePaste(
  e: React.ClipboardEvent | ClipboardEvent,
): boolean {
  const data = e.clipboardData;
  if (!clipboardHasNodeImage(data)) return false;

  const { selectedNodeId, editingNodeId, view, addImagesToSelected, addImagesFromPaths } =
    useAppStore.getState();
  if (view !== "map") return false;
  if (!selectedNodeId && !editingNodeId) {
    useAppStore.setState({
      error: "Select a node first, then paste the image.",
    });
    return false;
  }

  e.preventDefault();
  e.stopPropagation();

  const files = collectClipboardImageFiles(data);
  if (files.length > 0) {
    void addImagesToSelected(files);
    return true;
  }

  const paths = collectClipboardImagePaths(data);
  if (paths.length > 0) {
    void addImagesFromPaths(paths);
    return true;
  }

  void readImagesFromClipboard().then((asyncFiles) => {
    if (asyncFiles.length > 0) void addImagesToSelected(asyncFiles);
  });
  return true;
}
