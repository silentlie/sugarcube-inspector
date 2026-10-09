import type { SugarCubeSnapshot } from "../sugarcube/types";
import VariableTree from "./variable-tree/VariableTree";

interface VariablesProps {
  snapshot: SugarCubeSnapshot;
}

export default function Variables({ snapshot }: VariablesProps) {
  return (
    <div className="space-y-5 text-xs">
      <section>
        <h2 className="mb-2 text-sm font-medium">Story Variables</h2>

        <VariableTree scope="story" value={snapshot.variables.story} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Temporary Variables</h2>

        <VariableTree scope="temporary" value={snapshot.variables.temporary} />
      </section>
    </div>
  );
}
