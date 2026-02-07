import {
  any,
  anyChar,
  createLanguage,
  eof,
  many,
  manyTill,
  map,
  minus,
  optional,
  regex as parseRegex,
  seq,
  str,
  type Parser,
} from "@claudiu-ceia/combine";

const escapedCharacterParser = map(seq(str("\\"), anyChar()), () => null);

const singleQuotedParser = map(
  seq(
    str("'"),
    many(any(escapedCharacterParser, map(parseRegex(/[^'\\]+/, "single quoted text"), () => null))),
    str("'"),
  ),
  () => null,
);

const doubleQuotedParser = map(
  seq(
    str('"'),
    many(any(escapedCharacterParser, map(parseRegex(/[^"\\]+/, "double quoted text"), () => null))),
    str('"'),
  ),
  () => null,
);

const templateQuotedParser = map(
  seq(
    str("`"),
    many(any(escapedCharacterParser, map(parseRegex(/[^`\\]+/, "template text"), () => null))),
    str("`"),
  ),
  () => null,
);

const lineCommentParser = map(
  seq(str("//"), many(minus(anyChar(), str("\n"))), optional(str("\n"))),
  () => null,
);

const blockCommentParser = map(
  seq(str("/*"), manyTill(anyChar(), str("*/"))),
  () => null,
);

type BalancedChunkLanguage = {
  piece: Parser<null>;
  paren: Parser<null>;
  bracket: Parser<null>;
  brace: Parser<null>;
  singleQuote: Parser<null>;
  doubleQuote: Parser<null>;
  templateQuote: Parser<null>;
  lineComment: Parser<null>;
  blockComment: Parser<null>;
  plain: Parser<null>;
  slash: Parser<null>;
};

const balancedChunkLanguage = createLanguage<BalancedChunkLanguage>({
  piece: (self) =>
    any(
      self.paren,
      self.bracket,
      self.brace,
      self.singleQuote,
      self.doubleQuote,
      self.templateQuote,
      self.lineComment,
      self.blockComment,
      self.plain,
      self.slash,
    ),
  paren: (self) =>
    map(seq(str("("), many(self.piece), str(")")), () => null),
  bracket: (self) =>
    map(seq(str("["), many(self.piece), str("]")), () => null),
  brace: (self) =>
    map(seq(str("{"), many(self.piece), str("}")), () => null),
  singleQuote: () => singleQuotedParser,
  doubleQuote: () => doubleQuotedParser,
  templateQuote: () => templateQuotedParser,
  lineComment: () => lineCommentParser,
  blockComment: () => blockCommentParser,
  plain: () => map(parseRegex(/[^()[\]{}'"`/]+/, "plain text"), () => null),
  slash: () => map(str("/"), () => null),
});

const balancedChunkParser = map(
  seq(many(balancedChunkLanguage.piece), eof()),
  () => true,
);

export function isBalancedChunk(chunk: string): boolean {
  const result = balancedChunkParser({ text: chunk, index: 0 });
  return result.success;
}
