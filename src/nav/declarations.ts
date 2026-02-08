import ts from "typescript";
import path from "node:path";
import { buildCommand } from "@stricli/core";
import { createService, fromPosition, relativePath } from "../service.ts";

interface MemberInfo {
  name: string;
  signature: string;
  line: number;
  doc?: string;
}

interface DeclarationInfo {
  name: string;
  kind: string;
  signature: string;
  line: number;
  members?: MemberInfo[];
  doc?: string;
}

interface DeclarationsOutput {
  file: string;
  declarations: DeclarationInfo[];
}

export function formatDeclarationsOutput(result: DeclarationsOutput): string {
  const lines: string[] = [];
  lines.push(`//${result.file}`);

  const declarations = [...result.declarations].sort((a, b) => a.line - b.line);
  for (const decl of declarations) {
    lines.push(`${decl.line}: ${formatDeclarationLine(decl)}`);
    pushDoc(lines, decl.doc, "");

    if (decl.members && decl.members.length > 0) {
      const members = [...decl.members].sort((a, b) => a.line - b.line);
      for (const member of members) {
        lines.push(`${member.line}:   ${member.name}: ${member.signature}`);
        pushDoc(lines, member.doc, "  ");
      }
    }

    lines.push("");
  }

  // Trim the final blank line if present.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function formatDeclarationLine(decl: DeclarationInfo): string {
  switch (decl.kind) {
    case "function": {
      // `typeToString` for functions is typically `(args) => ret`.
      if (decl.signature.startsWith("(")) {
        const arrowMatch = decl.signature.match(/^\((.*)\)\s*=>\s*(.*)$/);
        if (arrowMatch) {
          const params = arrowMatch[1] ?? "";
          const returnType = arrowMatch[2] ?? "unknown";
          return `export function ${decl.name}(${params}): ${returnType}`;
        }
        return `export function ${decl.name}: ${decl.signature}`;
      }
      return `export function ${decl.name}: ${decl.signature}`;
    }
    case "const":
      return `export const ${decl.name}: ${decl.signature}`;
    case "type":
      return `export type ${decl.name} = ${decl.signature}`;
    case "interface":
      return `export interface ${decl.name}`;
    case "class":
      return `export class ${decl.name}`;
    case "enum":
      return `export enum ${decl.name}`;
    case "module":
      return `export module ${decl.name}`;
    default:
      return `export ${decl.kind} ${decl.name}: ${decl.signature}`;
  }
}

function pushDoc(lines: string[], doc: string | undefined, extraIndent: string): void {
  const normalized = (doc ?? "").trim();
  if (normalized.length === 0) {
    return;
  }

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      continue;
    }
    lines.push(`    ${extraIndent}${line}`);
  }
}

function formatDoc(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): string {
  const parts = symbol.getDocumentationComment(checker);
  const text = ts.displayPartsToString(parts).trim();

  const tags = symbol.getJsDocTags().map((tag) => {
    const body = (tag.text ?? []).map((p) => p.text).join("").trim();
    return body.length > 0 ? `@${tag.name} ${body}` : `@${tag.name}`;
  });

  const docLines: string[] = [];
  if (text.length > 0) {
    docLines.push(text);
  }
  for (const tag of tags) {
    docLines.push(tag);
  }

  return docLines.join("\n").trim();
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
    const type = (() => {
      // Prefer expanding type aliases to their RHS, so output resembles `deno doc`.
      if (ts.isTypeAliasDeclaration(declaration)) {
        return typeChecker.getTypeFromTypeNode(declaration.type);
      }

      if (
        kind === "interface"
        || kind === "class"
        || kind === "enum"
        || kind === "type"
      ) {
        return typeChecker.getDeclaredTypeOfSymbol(exp);
      }

      return typeChecker.getTypeOfSymbol(exp);
    })();
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
      doc: formatDoc(exp, typeChecker),
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
          doc: formatDoc(prop, typeChecker),
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

export type DeclarationsCommandFlags = {
  json?: boolean;
};

export const declarationsCommand = buildCommand({
  func(
    this: { process: { stdout: { write(s: string): void } } },
    flags: DeclarationsCommandFlags,
    file: string,
  ) {
    const result = getDeclarations(file);
    if (flags.json ?? false) {
      this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }

    this.process.stdout.write(`${formatDeclarationsOutput(result)}\n`);
  },
  parameters: {
    flags: {
      json: {
        kind: "boolean" as const,
        optional: true,
        brief: "Output structured JSON instead of compact text",
      },
    },
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
