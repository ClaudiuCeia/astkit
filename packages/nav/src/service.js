import ts from "typescript";
import path from "node:path";
export function createService(projectDir, targetFile) {
    const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists);
    let compilerOptions;
    let fileNames;
    let projectRoot;
    if (configPath) {
        const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
        if (error) {
            throw new Error(`Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
        }
        projectRoot = path.dirname(configPath);
        const parsed = ts.parseJsonConfigFileContent(config, ts.sys, projectRoot);
        compilerOptions = parsed.options;
        fileNames = parsed.fileNames;
    }
    else {
        compilerOptions = ts.getDefaultCompilerOptions();
        fileNames = [];
        projectRoot = projectDir;
    }
    // Ensure requested target files are in the language-service file set.
    const targetFiles = normalizeTargetFiles(targetFile);
    for (const requestedFile of targetFiles) {
        const resolved = path.resolve(requestedFile);
        if (!fileNames.includes(resolved)) {
            fileNames.push(resolved);
        }
    }
    const host = {
        getScriptFileNames: () => fileNames,
        getScriptVersion: () => "0",
        getScriptSnapshot: (file) => {
            const content = ts.sys.readFile(file);
            if (content === undefined)
                return undefined;
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
    const program = service.getProgram();
    return { service, program, projectRoot };
}
function normalizeTargetFiles(targetFile) {
    if (targetFile === undefined) {
        return [];
    }
    if (typeof targetFile === "string") {
        return [targetFile];
    }
    return [...targetFile];
}
/** Convert 1-indexed line:character to 0-indexed offset */
export function toPosition(sourceFile, line, character) {
    return sourceFile.getPositionOfLineAndCharacter(line - 1, character - 1);
}
/** Convert 0-indexed offset to 1-indexed { line, character } */
export function fromPosition(sourceFile, offset) {
    const lc = sourceFile.getLineAndCharacterOfPosition(offset);
    return { line: lc.line + 1, character: lc.character + 1 };
}
/** Get relative path from project root */
export function relativePath(projectRoot, filePath) {
    return path.relative(projectRoot, filePath);
}
