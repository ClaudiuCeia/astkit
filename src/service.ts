import ts from "typescript";
import path from "node:path";

export interface Service {
  service: ts.LanguageService;
  program: ts.Program;
  projectRoot: string;
}

export function createService(projectDir: string, targetFile?: string): Service {
  const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists);

  let compilerOptions: ts.CompilerOptions;
  let fileNames: string[];
  let projectRoot: string;

  if (configPath) {
    const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
    if (error) {
      throw new Error(`Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
    }
    projectRoot = path.dirname(configPath);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, projectRoot);
    compilerOptions = parsed.options;
    fileNames = parsed.fileNames;
  } else {
    compilerOptions = ts.getDefaultCompilerOptions();
    fileNames = [];
    projectRoot = projectDir;
  }

  // Ensure targetFile is in the file list
  if (targetFile) {
    const resolved = path.resolve(targetFile);
    if (!fileNames.includes(resolved)) {
      fileNames.push(resolved);
    }
  }

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const content = ts.sys.readFile(file);
      if (content === undefined) return undefined;
      return ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  const service = ts.createLanguageService(host);
  const program = service.getProgram()!;

  return { service, program, projectRoot };
}

/** Convert 1-indexed line:character to 0-indexed offset */
export function toPosition(sourceFile: ts.SourceFile, line: number, character: number): number {
  return sourceFile.getPositionOfLineAndCharacter(line - 1, character - 1);
}

/** Convert 0-indexed offset to 1-indexed { line, character } */
export function fromPosition(sourceFile: ts.SourceFile, offset: number): { line: number; character: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(offset);
  return { line: lc.line + 1, character: lc.character + 1 };
}

/** Get relative path from project root */
export function relativePath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath);
}
