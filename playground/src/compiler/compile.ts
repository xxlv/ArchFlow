import { graphFromAst } from "./graph";
import { parseArchFlow } from "./parser";
import type { ArchFlowAst, GraphModel } from "./types";
import { validateArchFlow } from "./validator";

export type CompileResult = {
  ast: ArchFlowAst;
  graph: GraphModel;
};

export function compileArchFlow(source: string): CompileResult {
  const ast = parseArchFlow(source);
  ast.diagnostics.push(...validateArchFlow(ast));
  return {
    ast,
    graph: graphFromAst(ast),
  };
}
