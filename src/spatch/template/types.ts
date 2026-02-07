export type TextToken = {
  kind: "text";
  value: string;
};

export type HoleToken = {
  kind: "hole";
  name: string;
  anonymous: boolean;
  constraintSource: string | null;
  constraintRegex: RegExp | null;
};

export type TemplateToken = TextToken | HoleToken;

export type CompiledTemplate = {
  source: string;
  tokens: TemplateToken[];
};

export type TemplateMatch = {
  start: number;
  end: number;
  text: string;
  captures: Record<string, string>;
};
