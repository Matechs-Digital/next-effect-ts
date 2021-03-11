import ts, { factory } from "typescript";
import path from "path"

export default function sourceFile(
  _program: ts.Program,
  _opts?: {
    identity?: boolean;
  }
) {
  const checker = _program.getTypeChecker();
  return {
    before(ctx: ts.TransformationContext) {
      return (sourceFile: ts.SourceFile) => {
        function visitor(node: ts.Node): ts.VisitResult<ts.Node> {
          if (ts.isCallExpression(node)) {
            const overloadDeclarations = checker
              .getResolvedSignature(node)
              ?.getDeclaration();

            const optimizeTagsOverload = overloadDeclarations
              ? (() => {
                  try {
                    return ts
                      .getAllJSDocTags(
                        overloadDeclarations,
                        (t): t is ts.JSDocTag =>
                          t.tagName.getText() === "compiler"
                      )
                      .map((e) => e.comment)
                      .filter((s): s is string => s != null);
                  } catch {
                    return undefined;
                  }
                })()
              : undefined;

            const optimizeTags = new Set([...(optimizeTagsOverload || [])]);

            if (optimizeTags.has("sourceFile")) {
              return factory.createStringLiteral(path.relative(path.join(__filename, "../../"), sourceFile.fileName));
            }
          }

          return ts.visitEachChild(node, visitor, ctx);
        }

        return ts.visitEachChild(sourceFile, visitor, ctx)
      };
    },
  };
}
