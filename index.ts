import ts from "typescript";
import path from "node:path";

const fileName = `${import.meta.dir}/index.ts`;
const fileText = await Bun.file(fileName).text();

const files = new Map<string, { version: number; text: string }>();
files.set(fileName, { version: 0, text: fileText });

function getCompilerOptions(directory: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(directory, ts.sys.fileExists);
  if (!configPath) return ts.getDefaultCompilerOptions();
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) return ts.getDefaultCompilerOptions();
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(configPath),
  );
  return parsed.options;
}

const compilerOptions = getCompilerOptions(process.cwd());

const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => [fileName],
  getScriptVersion: (file) => files.get(file)?.version.toString() ?? "0",
  getScriptSnapshot: (file) => {
    const content = files.get(file)?.text ?? ts.sys.readFile(file);
    if (!content) return undefined;
    return ts.ScriptSnapshot.fromString(content);
  },
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCompilationSettings: () => compilerOptions,
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};

const service = ts.createLanguageService(host);

// Go to definition
const sourceFile = service.getProgram()!.getSourceFile(fileName)!;
// Point at "LanguageServiceHost" on line 20 (0-indexed), character 16
const pos = sourceFile.getPositionOfLineAndCharacter(20, 16);

// Debug: see what's at that position
console.log("Position:", pos);
console.log("Text around position:", fileText.slice(pos - 5, pos + 25));

const defs = service.getDefinitionAtPosition(fileName, pos);
console.log("Definitions:", defs);
console.log(defs);
