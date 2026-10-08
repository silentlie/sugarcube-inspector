import type { SerializedValue } from "./serialize";

export interface SugarCubeSnapshot {
  story: {
    name: string;
    ifId: string;
    version?: string;
  };

  passage: {
    name: string;
    tags: string[];
  };

  history: {
    turns: number;
    length: number;
  };

  variables: {
    story: SerializedValue;
    temporary: SerializedValue;
  };

  capturedAt: number;
}
