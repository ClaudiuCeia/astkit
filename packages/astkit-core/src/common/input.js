import { readFile, stat } from "node:fs/promises";
import path from "node:path";
export async function resolveTextInput(input, options = {}) {
    if (input.includes("\n") || input.includes("\r")) {
        return input;
    }
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const inputPath = path.resolve(cwd, input);
    try {
        const inputStats = await stat(inputPath);
        if (!inputStats.isFile()) {
            throw new Error(`Input path is not a file: ${inputPath}`);
        }
        return await readFile(inputPath, options.encoding ?? "utf8");
    }
    catch (error) {
        if (isErrorWithCode(error) && error.code === "ENOENT") {
            return input;
        }
        throw error;
    }
}
function isErrorWithCode(error) {
    return typeof error === "object" && error !== null && "code" in error;
}
