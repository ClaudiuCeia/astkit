import ts from "typescript";
import path from "node:path";
import { buildCommand } from "@stricli/core";
import chalk, { Chalk, type ChalkInstance } from "chalk";
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
  endLine?: number;
}

interface DeclarationsOutput {
  file: string;
  declarations: DeclarationInfo[];
  doc?: string;
}

type FormatDeclarationsOutputOptions = {
  color?: boolean;
  chalkInstance?: ChalkInstance;
};

export function formatDeclarationsOutput(
  result: DeclarationsOutput,
  options: FormatDeclarationsOutputOptions = {},
): string {
  const lines: string[] = [];
  const chalkInstance = buildChalk(options);
  const useColor = chalkInstance.level > 0;
  const header = `//${result.file}`;
  lines.push(useColor ? chalkInstance.gray(header) : header);

  if (result.doc && result.doc.trim().length > 0) {
    lines.push("");
    lines.push(...renderDocBlock(result.doc, "", chalkInstance));
    lines.push("");
  }

  const declarations = [...result.declarations].sort((a, b) => a.line - b.line);
  for (const decl of declarations) {
    if (decl.doc && decl.doc.trim().length > 0) {
      lines.push(...renderDocBlock(decl.doc, "", chalkInstance));
    }

    const declLine = formatDeclarationLine(decl, chalkInstance);
    lines.push(formatLineWithNumber(decl.line, declLine, chalkInstance));

    const isBlock =
      decl.kind === "class" || decl.kind === "interface" || decl.kind === "enum";
    if (isBlock) {
      if (decl.members && decl.members.length > 0) {
        const members = [...decl.members].sort((a, b) => a.line - b.line);
        for (const member of members) {
          if (member.doc && member.doc.trim().length > 0) {
            lines.push(...renderDocBlock(member.doc, "  ", chalkInstance));
          }
          lines.push(
            formatLineWithNumber(
              member.line,
              `  ${formatMemberLine(member, decl.kind, chalkInstance)}`,
              chalkInstance,
            ),
          );
        }
      }

      const endLine = decl.endLine ?? decl.line;
      lines.push(formatLineWithNumber(endLine, "}", chalkInstance));
    }

    lines.push("");
  }

  // Trim the final blank line if present.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function formatDeclarationLine(decl: DeclarationInfo, chalkInstance: ChalkInstance): string {
  const useColor = chalkInstance.level > 0;
  const kw = (value: string) => (useColor ? chalkInstance.cyan(value) : value);
  const nm = (value: string) => (useColor ? chalkInstance.yellow(value) : value);
  const ty = (value: string) => (useColor ? chalkInstance.green(value) : value);

  switch (decl.kind) {
    case "function": {
      return `${kw("export")} ${kw("function")} ${nm(decl.name)}${formatCallableSignature(decl.signature, ty)}`;
    }
    case "const":
      return `${kw("export")} ${kw("const")} ${nm(decl.name)}: ${ty(decl.signature)}`;
    case "type":
      return `${kw("export")} ${kw("type")} ${nm(decl.name)} = ${ty(decl.signature)}`;
    case "interface":
      return `${kw("export")} ${kw("interface")} ${nm(decl.name)} {`;
    case "class":
      return `${kw("export")} ${kw("class")} ${nm(decl.name)} {`;
    case "enum":
      return `${kw("export")} ${kw("enum")} ${nm(decl.name)} {`;
    case "module":
      return `${kw("export")} ${kw("module")} ${nm(decl.name)}`;
    default:
      return `${kw("export")} ${kw(decl.kind)} ${nm(decl.name)}: ${ty(decl.signature)}`;
  }
}

function formatCallableSignature(
  rawSignature: string,
  formatType: (type: string) => string,
): string {
  // `typeToString` for functions/methods is typically `(args) => ret`.
  if (rawSignature.startsWith("(")) {
    const arrowMatch = rawSignature.match(/^\((.*)\)\s*=>\s*(.*)$/);
    if (arrowMatch) {
      const params = arrowMatch[1] ?? "";
      const returnType = arrowMatch[2] ?? "unknown";
      return `(${params}): ${formatType(returnType)}`;
    }
  }

  return `: ${formatType(rawSignature)}`;
}

function formatMemberLine(
  member: MemberInfo,
  containerKind: string,
  chalkInstance: ChalkInstance,
): string {
  const useColor = chalkInstance.level > 0;
  const kw = (value: string) => (useColor ? chalkInstance.cyan(value) : value);
  const nm = (value: string) => (useColor ? chalkInstance.yellow(value) : value);
  const ty = (value: string) => (useColor ? chalkInstance.green(value) : value);

  // Members are pre-rendered with modifiers by `getDeclarations()`. We only do
  // lightweight highlighting for names and return types.
  const signature = member.signature;

  // Interface members don't get a forced `public`.
  if (containerKind === "interface") {
    return highlightMemberSignature(signature, kw, nm, ty);
  }

  // Class/enum members: prefix `public` for consistency (unless already present).
  const trimmed = signature.trimStart();
  const hasVisibility =
    trimmed.startsWith("public ")
    || trimmed.startsWith("protected ")
    || trimmed.startsWith("private ");
  const visibleSignature = hasVisibility ? signature : `${kw("public")} ${signature}`;
  return highlightMemberSignature(visibleSignature, kw, nm, ty);
}

function highlightMemberSignature(
  signature: string,
  formatKeyword: (value: string) => string,
  formatName: (value: string) => string,
  formatType: (value: string) => string,
): string {
  // Best-effort highlighting for common member forms.
  // - `name: Type`
  // - `name(...): Type`
  // - `get name(): Type`
  // - `set name(value: T)`
  // - `static name(...): Type`
  const keywordRx = /\b(static|async|readonly|get|set|public|protected|private)\b/g;
  let out = signature.replace(keywordRx, (m) => formatKeyword(m));

  // Highlight identifier after `get`/`set`.
  out = out.replace(/\b(get|set)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, (_m, kw, name) => {
    return `${formatKeyword(kw)} ${formatName(name)}`;
  });

  // Highlight member name before `(` or `:`.
  out = out.replace(/(^|\s)([A-Za-z_$][A-Za-z0-9_$]*)(\s*(\(|:))/g, (_m, prefix, name, suffix) => {
    return `${prefix}${formatName(name)}${suffix}`;
  });

  // Highlight return type after `):`.
  out = out.replace(/\)\s*:\s*([^;]+)$/g, (_m, type) => {
    return `): ${formatType(type)}`;
  });

  // Highlight property type after `:`.
  out = out.replace(/:\s*([^;]+)$/g, (_m, type) => {
    return `: ${formatType(type)}`;
  });

  return out;
}

function formatLineWithNumber(
  line: number,
  content: string,
  chalkInstance: ChalkInstance,
): string {
  const useColor = chalkInstance.level > 0;
  const prefix = `${line}: `;
  return `${useColor ? chalkInstance.gray(prefix) : prefix}${content}`;
}

function renderDocBlock(
  doc: string,
  indent: string,
  chalkInstance: ChalkInstance,
): string[] {
  const useColor = chalkInstance.level > 0;
  const docColor = useColor ? chalkInstance.gray : (value: string) => value;
  const normalized = doc.trim();
  if (normalized.length === 0) {
    return [];
  }

  const lines: string[] = [];
  lines.push(docColor(`${indent}/**`));
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      continue;
    }
    lines.push(docColor(`${indent} * ${line}`));
  }
  lines.push(docColor(`${indent} */`));
  return lines;
}

function buildChalk(options: FormatDeclarationsOutputOptions): ChalkInstance {
  if (options.chalkInstance) {
    return options.chalkInstance;
  }

  const shouldColor = options.color ?? false;
  if (!shouldColor) {
    return new Chalk({ level: 0 });
  }

  const level = chalk.level > 0 ? chalk.level : 1;
  return new Chalk({ level });
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

function extractLeadingFileDoc(sourceFile: ts.SourceFile): string | undefined {
  const text = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, 0) ?? [];
  for (const range of ranges) {
    const comment = text.slice(range.pos, range.end);
    if (!comment.startsWith("/**")) {
      continue;
    }
    // Strip /** */ and leading `*` decorations.
    const body = comment
      .replace(/^\/\*\*/, "")
      .replace(/\*\/$/, "");
    const lines = body
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    const doc = lines.join("\n").trim();
    if (doc.length > 0) {
      return doc;
    }
  }
  return undefined;
}

function isNonPublicClassMember(member: ts.ClassElement): boolean {
  if (ts.isPropertyDeclaration(member) && ts.isPrivateIdentifier(member.name)) {
    return true;
  }

  const flags = ts.getCombinedModifierFlags(member);
  return Boolean(flags & ts.ModifierFlags.Private)
    || Boolean(flags & ts.ModifierFlags.Protected);
}

function buildClassMemberInfo(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  member: ts.ClassElement,
): MemberInfo | null {
  if (isNonPublicClassMember(member)) {
    return null;
  }

  const pos = fromPosition(sourceFile, member.getStart(sourceFile));
  const doc = (() => {
    const nameNode = ts.isConstructorDeclaration(member) ? undefined : member.name;
    if (!nameNode) {
      return "";
    }
    const symbol = checker.getSymbolAtLocation(nameNode);
    return symbol ? formatDoc(symbol, checker) : "";
  })();

  const modifiers: string[] = [];
  const modFlags = ts.getCombinedModifierFlags(member);
  if (modFlags & ts.ModifierFlags.Static) modifiers.push("static");
  if (modFlags & ts.ModifierFlags.Async) modifiers.push("async");
  if (modFlags & ts.ModifierFlags.Readonly) modifiers.push("readonly");

  const modifierPrefix = modifiers.length > 0 ? `${modifiers.join(" ")} ` : "";

  if (ts.isConstructorDeclaration(member)) {
    const params = member.parameters.map((p) => p.getText(sourceFile)).join(", ");
    return {
      name: "constructor",
      signature: `${modifierPrefix}constructor(${params})`,
      line: pos.line,
      doc,
    };
  }

  if (ts.isMethodDeclaration(member)) {
    const name = member.name.getText(sourceFile);
    const tparams = member.typeParameters?.map((p) => p.getText(sourceFile)).join(", ");
    const params = member.parameters.map((p) => p.getText(sourceFile)).join(", ");
    const returnType = member.type
      ? member.type.getText(sourceFile)
      : checker.typeToString(
          checker.getTypeAtLocation(member),
          member,
          ts.TypeFormatFlags.NoTruncation,
        );
    const tparamText = tparams && tparams.length > 0 ? `<${tparams}>` : "";
    return {
      name,
      signature: `${modifierPrefix}${name}${tparamText}(${params}): ${returnType}`,
      line: pos.line,
      doc,
    };
  }

  if (ts.isPropertyDeclaration(member)) {
    const name = member.name.getText(sourceFile);
    const optional = member.questionToken ? "?" : "";
    const typeText = member.type
      ? member.type.getText(sourceFile)
      : checker.typeToString(checker.getTypeAtLocation(member), member, ts.TypeFormatFlags.NoTruncation);
    return {
      name,
      signature: `${modifierPrefix}${name}${optional}: ${typeText}`,
      line: pos.line,
      doc,
    };
  }

  if (ts.isGetAccessorDeclaration(member)) {
    const name = member.name.getText(sourceFile);
    const returnType = member.type
      ? member.type.getText(sourceFile)
      : checker.typeToString(checker.getTypeAtLocation(member), member, ts.TypeFormatFlags.NoTruncation);
    return {
      name,
      signature: `${modifierPrefix}get ${name}(): ${returnType}`,
      line: pos.line,
      doc,
    };
  }

  if (ts.isSetAccessorDeclaration(member)) {
    const name = member.name.getText(sourceFile);
    const params = member.parameters.map((p) => p.getText(sourceFile)).join(", ");
    return {
      name,
      signature: `${modifierPrefix}set ${name}(${params})`,
      line: pos.line,
      doc,
    };
  }

  // Fallback for rare class elements (index signatures, etc.)
  const fallbackText = member.getText(sourceFile).replace(/\s*\{[\s\S]*$/, "").trim();
  return {
    name: "<member>",
    signature: `${modifierPrefix}${fallbackText}`,
    line: pos.line,
    doc,
  };
}

function buildInterfaceMemberInfo(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  member: ts.TypeElement,
): MemberInfo | null {
  const pos = fromPosition(sourceFile, member.getStart(sourceFile));
  const doc = (() => {
    if ("name" in member && member.name) {
      const symbol = checker.getSymbolAtLocation(member.name as ts.Node);
      return symbol ? formatDoc(symbol, checker) : "";
    }
    return "";
  })();

  if (ts.isPropertySignature(member) && member.name) {
    const name = member.name.getText(sourceFile);
    const optional = member.questionToken ? "?" : "";
    const typeText = member.type
      ? member.type.getText(sourceFile)
      : checker.typeToString(checker.getTypeAtLocation(member), member, ts.TypeFormatFlags.NoTruncation);
    return { name, signature: `${name}${optional}: ${typeText}`, line: pos.line, doc };
  }

  if (ts.isMethodSignature(member) && member.name) {
    const name = member.name.getText(sourceFile);
    const tparams = member.typeParameters?.map((p) => p.getText(sourceFile)).join(", ");
    const params = member.parameters.map((p) => p.getText(sourceFile)).join(", ");
    const returnType = member.type
      ? member.type.getText(sourceFile)
      : checker.typeToString(checker.getTypeAtLocation(member), member, ts.TypeFormatFlags.NoTruncation);
    const tparamText = tparams && tparams.length > 0 ? `<${tparams}>` : "";
    return { name, signature: `${name}${tparamText}(${params}): ${returnType}`, line: pos.line, doc };
  }

  // Fallback for call signatures, index signatures, etc.
  const fallbackText = member.getText(sourceFile).trim().replace(/;$/, "");
  return { name: "<member>", signature: fallbackText, line: pos.line, doc };
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
    return {
      file: relativePath(projectRoot, resolved),
      declarations: [],
      doc: extractLeadingFileDoc(sourceFile),
    };
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
    const endPos = fromPosition(sourceFile, declaration.end);

    const info: DeclarationInfo = {
      name: exp.getName(),
      kind,
      signature,
      line: pos.line,
      doc: formatDoc(exp, typeChecker),
      endLine: endPos.line,
    };

    // For classes and interfaces, enumerate members in source order.
    if (kind === "class" && ts.isClassDeclaration(declaration)) {
      const members: MemberInfo[] = [];
      for (const member of declaration.members) {
        const infoMember = buildClassMemberInfo(sourceFile, typeChecker, member);
        if (infoMember) {
          members.push(infoMember);
        }
      }

      if (members.length > 0) {
        info.members = members;
      }
    }

    if (kind === "interface" && ts.isInterfaceDeclaration(declaration)) {
      const members: MemberInfo[] = [];
      for (const member of declaration.members) {
        const infoMember = buildInterfaceMemberInfo(sourceFile, typeChecker, member);
        if (infoMember) {
          members.push(infoMember);
        }
      }
      if (members.length > 0) {
        info.members = members;
      }
    }

    declarations.push(info);
  }

  return {
    file: relativePath(projectRoot, resolved),
    declarations,
    doc: extractLeadingFileDoc(sourceFile),
  };
}

export type DeclarationsCommandFlags = {
  json?: boolean;
  "no-color"?: boolean;
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

    const output = formatDeclarationsOutput(result, {
      color: Boolean(process.stdout.isTTY) && !(flags["no-color"] ?? false),
    });
    this.process.stdout.write(`${output}\n`);
  },
  parameters: {
    flags: {
      json: {
        kind: "boolean" as const,
        optional: true,
        brief: "Output structured JSON instead of compact text",
      },
      "no-color": {
        kind: "boolean" as const,
        optional: true,
        brief: "Disable colored output",
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
