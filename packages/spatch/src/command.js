import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stderr as processStderr, stdin as processStdin, stdout as processStdout, } from "node:process";
import { createInterface } from "node:readline/promises";
import { buildCommand } from "@stricli/core";
import chalk, { Chalk } from "chalk";
import { patchProject } from "./spatch.js";
export async function runPatchCommand(patchInput, scope, flags, options = {}) {
    const patchScope = scope ?? ".";
    const patchCwd = flags.cwd;
    if (flags.interactive ?? false) {
        if (flags["dry-run"] ?? false) {
            throw new Error("Cannot combine --interactive with --dry-run.");
        }
        return runInteractivePatchCommand(patchInput, patchScope, patchCwd, flags["no-color"] ?? false, options.interactiveDecider);
    }
    return patchProject(patchInput, {
        concurrency: flags.concurrency,
        cwd: patchCwd,
        dryRun: flags["dry-run"] ?? false,
        scope: patchScope,
        verbose: flags.verbose,
        logger: flags.verbose ? (line) => processStderr.write(`${line}\n`) : undefined,
    });
}
export function formatPatchOutput(result, options = {}) {
    const chalkInstance = buildChalk(options);
    const useColor = chalkInstance.level > 0;
    const lines = [];
    const changedFiles = result.files.filter((file) => file.replacementCount > 0);
    for (const file of changedFiles) {
        const headerPrefix = useColor ? chalkInstance.bold : (value) => value;
        lines.push(headerPrefix(`diff --git a/${file.file} b/${file.file}`));
        lines.push(useColor ? chalkInstance.gray(`--- a/${file.file}`) : `--- a/${file.file}`);
        lines.push(useColor ? chalkInstance.gray(`+++ b/${file.file}`) : `+++ b/${file.file}`);
        for (const occurrence of file.occurrences) {
            if (occurrence.matched === occurrence.replacement) {
                continue;
            }
            const oldCount = countLines(occurrence.matched);
            const newCount = countLines(occurrence.replacement);
            const hunkHeader = `@@ -${occurrence.line},${oldCount} +${occurrence.line},${newCount} @@`;
            lines.push(useColor ? chalkInstance.cyan(hunkHeader) : hunkHeader);
            for (const oldLine of splitDiffLines(occurrence.matched)) {
                const line = `-${oldLine}`;
                lines.push(useColor ? chalkInstance.red(line) : line);
            }
            for (const newLine of splitDiffLines(occurrence.replacement)) {
                const line = `+${newLine}`;
                lines.push(useColor ? chalkInstance.green(line) : line);
            }
        }
    }
    if (changedFiles.length === 0) {
        lines.push(useColor ? chalkInstance.gray("No changes.") : "No changes.");
    }
    const summary = [
        `${result.filesChanged} ${pluralize("file", result.filesChanged)} changed`,
        `${result.totalReplacements} ${pluralize("replacement", result.totalReplacements)}`,
        result.dryRun ? "(dry-run)" : null,
    ]
        .filter((part) => part !== null)
        .join(", ");
    lines.push(useColor ? chalkInstance.gray(summary) : summary);
    return lines.join("\n");
}
export const patchCommand = buildCommand({
    async func(flags, patchInput, scope) {
        const result = await runPatchCommand(patchInput, scope, flags);
        if (flags.json ?? false) {
            this.process.stdout.write(JSON.stringify(result, null, 2) + "\n");
            return;
        }
        const output = formatPatchOutput(result, {
            color: Boolean(processStdout.isTTY) && !(flags["no-color"] ?? false),
        });
        this.process.stdout.write(`${output}\n`);
    },
    parameters: {
        flags: {
            concurrency: {
                kind: "parsed",
                optional: true,
                brief: "Max files processed concurrently (default: 8)",
                placeholder: "n",
                parse: (input) => {
                    const value = Number(input);
                    if (!Number.isFinite(value) || value <= 0) {
                        throw new Error("--concurrency must be a positive number");
                    }
                    return Math.floor(value);
                },
            },
            verbose: {
                kind: "parsed",
                optional: true,
                brief: "Print perf tracing (1=summary, 2=includes slow files)",
                placeholder: "level",
                parse: (input) => {
                    const value = Number(input);
                    if (!Number.isFinite(value) || value < 0) {
                        throw new Error("--verbose must be a non-negative number");
                    }
                    return Math.floor(value);
                },
            },
            interactive: {
                kind: "boolean",
                optional: true,
                brief: "Interactively select which matches to apply",
            },
            json: {
                kind: "boolean",
                optional: true,
                brief: "Output structured JSON instead of compact diff-style text",
            },
            "no-color": {
                kind: "boolean",
                optional: true,
                brief: "Disable colored output",
            },
            "dry-run": {
                kind: "boolean",
                optional: true,
                brief: "Preview changes without writing files",
            },
            cwd: {
                kind: "parsed",
                optional: true,
                brief: "Working directory for resolving patch file and scope",
                placeholder: "path",
                parse: (input) => input,
            },
        },
        positional: {
            kind: "tuple",
            parameters: [
                {
                    brief: "Patch document text or path to patch document file",
                    placeholder: "patch",
                    parse: (input) => input,
                },
                {
                    brief: "Scope file or directory (defaults to current directory)",
                    placeholder: "scope",
                    parse: (input) => input,
                    optional: true,
                },
            ],
        },
    },
    docs: {
        brief: "Apply structural rewrite from a patch document",
    },
});
function buildChalk(options) {
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
function splitDiffLines(text) {
    const normalized = text.replaceAll("\r\n", "\n");
    if (normalized.length === 0) {
        return [""];
    }
    return normalized.split("\n");
}
function countLines(text) {
    const normalized = text.replaceAll("\r\n", "\n");
    if (normalized.length === 0) {
        return 0;
    }
    return normalized.split("\n").length;
}
function pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
}
async function runInteractivePatchCommand(patchInput, scope, cwd, noColor, interactiveDecider) {
    if (!interactiveDecider && (!processStdin.isTTY || !processStdout.isTTY)) {
        throw new Error("Interactive mode requires a TTY stdin/stdout.");
    }
    const startedAt = Date.now();
    const dryResult = await patchProject(patchInput, {
        cwd,
        dryRun: true,
        scope,
    });
    const totalChanges = dryResult.files.reduce((count, file) => count +
        file.occurrences.filter((occurrence) => occurrence.matched !== occurrence.replacement).length, 0);
    let interactivePrompt = null;
    const decider = interactiveDecider ??
        ((interactivePrompt = await createTerminalInteractiveDecider(noColor)),
            interactivePrompt.decider);
    const selectedByFile = new Map();
    let applyAll = false;
    let stop = false;
    let changeNumber = 0;
    try {
        for (const file of dryResult.files) {
            const selected = [];
            for (const occurrence of file.occurrences) {
                if (occurrence.matched === occurrence.replacement) {
                    continue;
                }
                changeNumber += 1;
                if (applyAll) {
                    selected.push(occurrence);
                    continue;
                }
                const choice = await decider({
                    file: file.file,
                    occurrence,
                    changeNumber,
                    totalChanges,
                });
                if (choice === "yes") {
                    selected.push(occurrence);
                    continue;
                }
                if (choice === "all") {
                    applyAll = true;
                    selected.push(occurrence);
                    continue;
                }
                if (choice === "quit") {
                    stop = true;
                    break;
                }
            }
            selectedByFile.set(file.file, selected);
            if (stop) {
                break;
            }
        }
    }
    finally {
        interactivePrompt?.close();
    }
    const fileResults = [];
    let filesChanged = 0;
    let totalReplacements = 0;
    for (const file of dryResult.files) {
        const selected = selectedByFile.get(file.file) ?? [];
        if (selected.length === 0) {
            fileResults.push({
                ...file,
                replacementCount: 0,
                changed: false,
                byteDelta: 0,
                occurrences: [],
            });
            continue;
        }
        const absolutePath = path.resolve(cwd ?? process.cwd(), file.file);
        const originalText = await readFile(absolutePath, "utf8");
        const rewrittenText = applySelectedOccurrences(originalText, selected);
        const changed = rewrittenText !== originalText;
        if (changed) {
            await writeFile(absolutePath, rewrittenText, "utf8");
        }
        const replacementCount = selected.filter((occurrence) => occurrence.matched !== occurrence.replacement).length;
        totalReplacements += replacementCount;
        if (changed) {
            filesChanged += 1;
        }
        fileResults.push({
            ...file,
            replacementCount,
            changed,
            byteDelta: changed
                ? Buffer.byteLength(rewrittenText, "utf8") -
                    Buffer.byteLength(originalText, "utf8")
                : 0,
            occurrences: selected,
        });
    }
    return {
        ...dryResult,
        dryRun: false,
        filesChanged,
        totalReplacements,
        elapsedMs: Date.now() - startedAt,
        files: fileResults,
    };
}
function applySelectedOccurrences(source, occurrences) {
    if (occurrences.length === 0) {
        return source;
    }
    const sorted = [...occurrences].sort((left, right) => left.start - right.start);
    const parts = [];
    let cursor = 0;
    for (const occurrence of sorted) {
        parts.push(source.slice(cursor, occurrence.start));
        parts.push(occurrence.replacement);
        cursor = occurrence.end;
    }
    parts.push(source.slice(cursor));
    return parts.join("");
}
async function createTerminalInteractiveDecider(noColor) {
    const chalkInstance = buildChalk({
        color: processStdout.isTTY && !noColor,
    });
    const useColor = chalkInstance.level > 0;
    const rl = createInterface({
        input: processStdin,
        output: processStdout,
    });
    return {
        decider: async ({ file, occurrence, changeNumber, totalChanges }) => {
            processStdout.write(`\n${formatInteractiveChangeBlock({ file, occurrence, changeNumber, totalChanges }, {
                chalkInstance,
                color: useColor,
            })}\n`);
            while (true) {
                const answer = await rl.question(useColor
                    ? chalkInstance.bold("Choice [y/n/a/q] (default: n): ")
                    : "Choice [y/n/a/q] (default: n): ");
                const parsed = parseInteractiveChoice(answer);
                if (parsed) {
                    return parsed;
                }
                processStdout.write(useColor
                    ? `${chalkInstance.yellow("Invalid choice.")} Use y, n, a, or q.\n`
                    : "Invalid choice. Use y, n, a, or q.\n");
            }
        },
        close: () => rl.close(),
    };
}
function formatInteractiveChangeBlock(ctx, options = {}) {
    const chalkInstance = buildChalk(options);
    const useColor = chalkInstance.level > 0;
    const divider = "─".repeat(72);
    const oldCount = countLines(ctx.occurrence.matched);
    const newCount = countLines(ctx.occurrence.replacement);
    const hunkHeader = `@@ -${ctx.occurrence.line},${oldCount} +${ctx.occurrence.line},${newCount} @@`;
    const lines = [
        useColor ? chalkInstance.gray(divider) : divider,
        useColor
            ? chalkInstance.bold(`Change ${ctx.changeNumber}/${ctx.totalChanges} · ${ctx.file}:${ctx.occurrence.line}:${ctx.occurrence.character}`)
            : `Change ${ctx.changeNumber}/${ctx.totalChanges} · ${ctx.file}:${ctx.occurrence.line}:${ctx.occurrence.character}`,
        useColor ? chalkInstance.cyan(hunkHeader) : hunkHeader,
        ...splitDiffLines(ctx.occurrence.matched).map((line) => useColor ? chalkInstance.red(`-${line}`) : `-${line}`),
        ...splitDiffLines(ctx.occurrence.replacement).map((line) => useColor ? chalkInstance.green(`+${line}`) : `+${line}`),
        useColor
            ? chalkInstance.gray("Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit")
            : "Actions: [y] apply · [n] skip · [a] apply remaining · [q] quit",
    ];
    return lines.join("\n");
}
function parseInteractiveChoice(answer) {
    const normalized = answer.trim().toLowerCase();
    if (normalized.length === 0 || normalized === "n" || normalized === "no") {
        return "no";
    }
    if (normalized === "y" || normalized === "yes") {
        return "yes";
    }
    if (normalized === "a" || normalized === "all") {
        return "all";
    }
    if (normalized === "q" || normalized === "quit") {
        return "quit";
    }
    return null;
}
