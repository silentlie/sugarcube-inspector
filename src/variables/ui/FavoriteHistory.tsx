import { useEffect, useRef } from "react";
import { favoriteStore } from "../favorites";
import { formatFavoritePath, type FavoriteLocation } from "../location";
import { useVariable } from "./useVariableWatch";

export default function FavoriteHistory({ location, close }: {
  location: FavoriteLocation;
  close: () => void;
}) {
  useVariable(location); // The same subscription publishes newly sampled changes.
  const changes = favoriteStore.getChanges(location.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return <section id="sugarcube-favorite-history" aria-label="Favorite change history"
    className="max-h-[min(12rem,50%)] shrink-0 overflow-auto border-b border-current px-2 py-1">
    <div className="flex items-start justify-between gap-2">
      <h4 ref={headingRef} tabIndex={-1} className="min-w-0 font-semibold wrap-anywhere">
        History for {formatFavoritePath(location)}
      </h4>
      <button type="button" className="shrink-0 cursor-pointer rounded px-1 underline" onClick={close}>
        Close history
      </button>
    </div>
    {changes.length > 0 ? <ol className="text-xs">
      {changes.map(({ id, before, after, turn, passage }) => <li key={id} className="py-1 wrap-anywhere">
        <p>Turn {turn} · {passage}</p>
        <code>{before} → {after}</code>
      </li>)}
    </ol> : <p>No changes observed yet.</p>}
  </section>;
}
