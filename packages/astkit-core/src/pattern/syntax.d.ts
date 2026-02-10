import type { CompiledTemplate, TemplateToken } from "./types.ts";
export declare function tokenizeTemplate(source: string): TemplateToken[];
export declare function compileTemplate(source: string): CompiledTemplate;
