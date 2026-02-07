import ts from "typescript";
import path from "node:path";
import { buildCommand } from "@stricli/core";
import { createService, fromPosition, relativePath } from "../service.ts";

interface MemberInfo {
  name: string;
  signature: string;
  line: number;
}

interface DeclarationInfo {
  name: string;
  kind: string;
  signature: string;
  line: number;
  members?: MemberInfo[];
}

interface DeclarationsOutput {
  file: string;
  declarations: DeclarationInfo[];
}

function getDeclarationKind(declaration: ts.Declaration): string {
  if (ts.isFunctionDeclaration(declaration)) return "function";
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  if (ts.isTypeAliasDeclaration(declaration)) return "type";
  if (ts.isEnumDeclaration(declaration)) return "enum";
  if (ts.isVariableDeclaration(declaration)) return "const";
  if (ts.isModuleDeclaration(declaration)) return "module";
  return "unknown";
}

export function getDeclarations(filePath: string): DeclarationsOutput {
  const resolved = path.resolve(filePath);
  const { program, projectRoot } = createService(process.cwd(), resolved);

  const sourceFile = program.getSourceFile(resolved);
  if (!sourceFile) {
    throw new Error(`File not found: ${filePath}`);
  }

  const typeChecker = program.getTypeChecker();
  const moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    return { file: relativePath(projectRoot, resolved), declarations: [] };
  }

  const exports = typeChecker.getExportsOfModule(moduleSymbol);
  const declarations: DeclarationInfo[] = [];

  for (const exp of exports) {
    const decls = exp.getDeclarations();
    if (!decls || decls.length === 0) continue;

    const declaration = decls[0]!;
    // Only include declarations from the target file
    if (declaration.getSourceFile().fileName !== resolved) continue;

    const kind = getDeclarationKind(declaration);
    const type = (kind === "interface" || kind === "class" || kind === "enum" || kind === "type")
      ? typeChecker.getDeclaredTypeOfSymbol(exp)
      : typeChecker.getTypeOfSymbol(exp);
    const signature = typeChecker.typeToString(
      type,
      declaration,
      ts.TypeFormatFlags.NoTruncation,
    );
    const pos = fromPosition(sourceFile, declaration.getStart(sourceFile));

    const info: DeclarationInfo = {
      name: exp.getName(),
      kind,
      signature,
      line: pos.line,
    };

    // For classes and interfaces, enumerate members
    if (kind === "class" || kind === "interface") {
      const declType = typeChecker.getDeclaredTypeOfSymbol(exp);
      const properties = typeChecker.getPropertiesOfType(declType);
      const members: MemberInfo[] = [];

      for (const prop of properties) {
        const propDecls = prop.getDeclarations();
        if (!propDecls || propDecls.length === 0) continue;

        const propDecl = propDecls[0]!;
        // Only include members from this file
        if (propDecl.getSourceFile().fileName !== resolved) continue;

        const propType = typeChecker.getTypeOfSymbol(prop);
        const propSignature = typeChecker.typeToString(propType, propDecl, ts.TypeFormatFlags.NoTruncation);
        const propPos = fromPosition(sourceFile, propDecl.getStart(sourceFile));

        members.push({
          name: prop.getName(),
          signature: propSignature,
          line: propPos.line,
        });
      }

      if (members.length > 0) {
        info.members = members;
      }
    }

    declarations.push(info);
  }

  return { file: relativePath(projectRoot, resolved), declarations };
}

export const declarationsCommand = buildCommand({
  func(this: { process: { stdout: { write(s: string): void } } }, _flags, file: string) {
    const result = getDeclarations(file);
    this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  },
  parameters: {
    positional: {
      kind: "tuple" as const,
      parameters: [
        {
          brief: "File to list declarations from",
          placeholder: "file",
          parse: (input: string) => input,
        },
      ],
    },
  },
  docs: {
    brief: "List exported declarations and type signatures",
  },
});
