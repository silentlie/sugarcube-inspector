import { pathToKey, resolvePath, type PathResolution } from "./path";
import type { SugarCubeVariables } from "../types";
import type { VariablePath } from "../watch/types";
import type { CollectionMembers } from "../watch/structure";

/** Reads live SugarCube paths and tracks collection entry identities between polls. */
export class LiveVariableService {
  private previousCollections = new Map<string, CollectionMembers>();
  private pendingCollections = new Map<string, CollectionMembers>();

  read(stores: SugarCubeVariables, path: VariablePath): PathResolution {
    return resolvePath(stores, path);
  }

  beginPoll(): void {
    this.pendingCollections = new Map();
  }

  /** Compare live identities after initial clone-to-live content comparison. */
  collectionChanged(
    path: VariablePath,
    synchronized: CollectionMembers | null,
    current: CollectionMembers | null,
    sameValue: (previous: unknown, current: unknown) => boolean,
  ): boolean {
    const key = pathToKey(path);
    if (current) this.pendingCollections.set(key, current);
    if (!synchronized || !current || synchronized.kind !== current.kind) return false;

    // The synchronized collection contains clones; it cannot compare live identity.
    const tracked = this.previousCollections.get(key);
    const previousEntries = tracked?.kind === current.kind ? tracked.entries : synchronized.entries;
    const useLiveReferences = tracked?.kind === current.kind;
    return previousEntries.length !== current.entries.length ||
      previousEntries.some((member, index) =>
        useLiveReferences
          ? !Object.is(member, current.entries[index])
          : !sameValue(member, current.entries[index]),
      );
  }

  /** Do not advance live tracking unless synchronized patches were applied. */
  commitPoll(): void {
    this.previousCollections = this.pendingCollections;
    this.pendingCollections = new Map();
  }

  reset(): void {
    this.previousCollections.clear();
    this.pendingCollections.clear();
  }
}
