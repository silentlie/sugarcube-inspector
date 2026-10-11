import { pathToKey, resolvePath, type PathKey, type PathResolution } from "./path";
import type { SugarCubeVariables } from "../types";
import type { VariablePath } from "../watch/types";
import type { CollectionStructure } from "../watch/structure";

/** Reads live SugarCube paths and tracks collection entry identities between polls. */
export class LiveVariableService {
  private previousCollections = new Map<PathKey, CollectionStructure>();
  private pendingCollections = new Map<PathKey, CollectionStructure>();

  read(stores: SugarCubeVariables, path: VariablePath): PathResolution {
    return resolvePath(stores, path);
  }

  beginPoll(): void {
    this.pendingCollections = new Map();
  }

  /** Compare live identities after initial clone-to-live content comparison. */
  collectionChanged(
    path: VariablePath,
    synchronized: CollectionStructure | null,
    current: CollectionStructure | null,
    sameValue: (previous: unknown, current: unknown) => boolean,
  ): boolean {
    const key = pathToKey(path);
    if (current) this.pendingCollections.set(key, current);
    if (!synchronized || !current || synchronized.kind !== current.kind) return false;

    // The synchronized collection contains clones; it cannot compare live identity.
    const tracked = this.previousCollections.get(key);
    const previousMembers = tracked?.kind === current.kind ? tracked.members : synchronized.members;
    const useLiveReferences = tracked?.kind === current.kind;
    return previousMembers.length !== current.members.length ||
      previousMembers.some((member, index) =>
        useLiveReferences
          ? !Object.is(member, current.members[index])
          : !sameValue(member, current.members[index]),
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
