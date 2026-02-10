import { buildCommand } from "@stricli/core";
import chalk, { Chalk } from "chalk";
import { searchProject } from "./sgrep.js";
export async function runSearchCommand(patternInput, scope, flags) {
    return searchProject(patternInput, {
        concurrency: flags.concurrency,
        cwd: flags.cwd,
        isomorphisms: !(flags["no-isomorphisms"] ?? false),
        scope: scope ?? ".",
        verbose: flags.verbose,
        logger: flags.verbose ? (line) => process.stderr.write(`${line}\n`) : undefined,
    });
}
export function formatSearchOutput(result, options = {}) {
    if (result.files.length === 0) {
        return "";
    }
    const chalkInstance = buildChalk(options);
    const useColor = chalkInstance.level > 0;
    const captureColorMap = useColor
        ? buildCaptureColorMap(result)
        : new Map();
    const lines = [];
    for (const file of result.files) {
        lines.push(useColor ? chalkInstance.gray(`//${file.file}`) : `//${file.file}`);
        for (const match of file.matches) {
            const preview = buildMatchPreview(match.matched);
            const linePrefix = useColor
                ? chalkInstance.gray(`${match.line}: `)
                : `${match.line}: `;
            const highlightedPreview = useColor
                ? highlightCaptures(preview.text, match.captures, chalkInstance, captureColorMap)
                : preview.text;
            const previewSuffix = preview.truncated
                ? useColor
                    ? chalkInstance.gray(" ...")
                    : " ..."
                : "";
            lines.push(`${linePrefix}${highlightedPreview}${previewSuffix}`);
        }
    }
    return lines.join("\n");
}
function buildMatchPreview(matchedText) {
    const normalized = matchedText.replaceAll("\r\n", "\n");
    const firstLine = normalized.split("\n")[0] ?? "";
    return {
        text: firstLine,
        truncated: normalized.includes("\n"),
    };
}
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
function highlightCaptures(preview, captures, chalkInstance, captureColorMap) {
    if (preview.length === 0) {
        return preview;
    }
    const colorPalette = [
        chalkInstance.cyan,
        chalkInstance.green,
        chalkInstance.yellow,
        chalkInstance.magenta,
        chalkInstance.blue,
        chalkInstance.red,
    ];
    const captureEntries = Object.entries(captures)
        .map(([name, value]) => [name, toPreviewSearchValue(value)])
        .filter(([name, value]) => name.length > 0 && value.length > 0);
    if (captureEntries.length === 0) {
        return preview;
    }
    const ranges = [];
    const sortedEntries = [...captureEntries].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
    for (let entryIndex = 0; entryIndex < sortedEntries.length; entryIndex += 1) {
        const [name, value] = sortedEntries[entryIndex];
        const colorIndex = captureColorMap.get(name) ?? (entryIndex % colorPalette.length);
        let fromIndex = 0;
        while (fromIndex < preview.length) {
            const matchIndex = preview.indexOf(value, fromIndex);
            if (matchIndex < 0) {
                break;
            }
            const matchEnd = matchIndex + value.length;
            const overlaps = ranges.some((range) => matchIndex < range.end && range.start < matchEnd);
            if (!overlaps) {
                ranges.push({
                    start: matchIndex,
                    end: matchEnd,
                    colorIndex,
                });
            }
            fromIndex = matchIndex + value.length;
        }
    }
    if (ranges.length === 0) {
        return preview;
    }
    ranges.sort((left, right) => left.start - right.start);
    const parts = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start > cursor) {
            parts.push(preview.slice(cursor, range.start));
        }
        const colorize = colorPalette[range.colorIndex] ?? chalkInstance.white;
        parts.push(colorize(preview.slice(range.start, range.end)));
        cursor = range.end;
    }
    if (cursor < preview.length) {
        parts.push(preview.slice(cursor));
    }
    return parts.join("");
}
function toPreviewSearchValue(rawValue) {
    const normalized = rawValue.replaceAll("\r\n", "\n");
    return normalized.split("\n")[0] ?? "";
}
function buildCaptureColorMap(result) {
    const captureNames = [];
    const seen = new Set();
    for (const file of result.files) {
        for (const match of file.matches) {
            for (const name of Object.keys(match.captures)) {
                if (seen.has(name)) {
                    continue;
                }
                seen.add(name);
                captureNames.push(name);
            }
        }
    }
    captureNames.sort((left, right) => left.localeCompare(right));
    const captureColorMap = new Map();
    for (let index = 0; index < captureNames.length; index += 1) {
        const name = captureNames[index];
        if (name) {
            captureColorMap.set(name, index);
        }
    }
    return captureColorMap;
}
export const searchCommand = buildCommand({
    async func(flags, patternInput, scope) {
        const result = await runSearchCommand(patternInput, scope, flags);
        if (flags.json ?? false) {
            this.process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }
        const output = formatSearchOutput(result, {
            color: Boolean(process.stdout.isTTY) && !(flags["no-color"] ?? false),
        });
        if (output.length > 0) {
            this.process.stdout.write(`${output}\n`);
        }
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
                brief: "Print perf tracing to stderr (1=summary, 2=includes slow files)",
                placeholder: "level",
                parse: (input) => {
                    const value = Number(input);
                    if (!Number.isFinite(value) || value < 0) {
                        throw new Error("--verbose must be a non-negative number");
                    }
                    return Math.floor(value);
                },
            },
            json: {
                kind: "boolean",
                optional: true,
                brief: "Output structured JSON instead of compact text",
            },
            "no-color": {
                kind: "boolean",
                optional: true,
                brief: "Disable colored output",
            },
            "no-isomorphisms": {
                kind: "boolean",
                optional: true,
                brief: "Disable isomorphism expansion during matching",
            },
            cwd: {
                kind: "parsed",
                optional: true,
                brief: "Working directory for resolving pattern file and scope",
                placeholder: "path",
                parse: (input) => input,
            },
        },
        positional: {
            kind: "tuple",
            parameters: [
                {
                    brief: "Pattern text or path to pattern file",
                    placeholder: "pattern",
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
        brief: "Run structural search (sgrep-style) from a pattern",
    },
});
