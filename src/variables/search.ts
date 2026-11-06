import { formatFavoritePath, getLocationName, type FavoritePath } from "./location";
import { refreshItem, type VariableNode } from "./nodes";

export function findVariablePaths(items: readonly VariableNode[], query: string): FavoritePath[] {
  const limit = 20;
  const exact: FavoritePath[] = [];
  const partial: FavoritePath[] = [];
  function visit(nodes: readonly VariableNode[]) {
    for (const node of nodes) {
      if (exact.length === limit) return;
      const path = node.favoritePath;
      if (!path || path.path.some((key) => typeof key === "symbol")) continue;
      const name = getLocationName(node.location).toLowerCase();
      const fullPath = formatFavoritePath(path).toLowerCase();
      if (name === query || fullPath === query) exact.push(path);
      else if (partial.length < limit && (name.includes(query) || fullPath.includes(query))) partial.push(path);
      // Collapsed branches retain their children but stop polling for changes.
      if (node.children && exact.length < limit) visit(refreshItem(node).children ?? []);
    }
  }
  visit(items);
  return [...exact, ...partial].slice(0, limit);
}

type RevealedVariable = { items: VariableNode[]; ancestors: number[]; key: number };

export function revealVariablePath(items: VariableNode[], path: readonly PropertyKey[]): RevealedVariable | undefined {
  const index = items.findIndex((node) => node.location.kind === "property" && node.location.key === path[0]);
  const node = items[index];
  if (!node) return;
  if (path.length === 1) return { items, ancestors: [], key: node.key };

  const expanded = refreshItem(node, true);
  if (!expanded.children) return;
  const child = revealVariablePath(expanded.children, path.slice(1));
  if (!child) return;
  return {
    items: items.with(index, { ...expanded, children: child.items }),
    ancestors: [node.key, ...child.ancestors],
    key: child.key,
  };
}
