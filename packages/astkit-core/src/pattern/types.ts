export type TextToken = {
  kind: "text";
  value: string;
};

export type EllipsisToken = {
  kind: "ellipsis";
  index: number;
};

export type HoleToken = {
  kind: "hole";
  name: string;
  anonymous: boolean;
  constraintSource: string | null;
  constraintRegex: RegExp | null;
};

export type TemplateToken = TextToken | HoleToken | EllipsisToken;

export type CompiledTemplate = {
  source: string;
  tokens: TemplateToken[];
};

export type CompiledReplacementTemplate = {
  source: string;
  tokens: TemplateToken[];
};

export type TemplateMatch = {
  start: number;
  end: number;
  text: string;
  captures: Record<string, string>;
};

export const ELLIPSIS_CAPTURE_PREFIX = "__ellipsis_";
