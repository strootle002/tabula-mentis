export type QueryField =
  | "text"
  | "tag"
  | "page"
  | "map"
  | "property"
  | "task"
  | "status";

export interface QueryRecord {
  id: string;
  text: string;
  tags?: string[];
  page?: string;
  map?: string;
  properties?: Record<string, string | number | boolean>;
  task?: boolean;
  status?: string;
}

export type QueryExpression =
  | { type: "predicate"; field: QueryField; value: string; propertyKey?: string }
  | { type: "and" | "or"; left: QueryExpression; right: QueryExpression }
  | { type: "not"; expression: QueryExpression };

export class QuerySyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuerySyntaxError";
  }
}

interface Token {
  value: string;
  offset: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    if (/\s/.test(input[index])) {
      index += 1;
      continue;
    }
    if (input[index] === "(" || input[index] === ")") {
      tokens.push({ value: input[index], offset: index++ });
      continue;
    }
    const offset = index;
    let value = "";
    let quoted = false;
    while (index < input.length) {
      const char = input[index];
      if (!quoted && (/\s/.test(char) || char === "(" || char === ")")) break;
      if (char === '"') {
        quoted = !quoted;
        index += 1;
        continue;
      }
      if (char === "\\" && quoted && index + 1 < input.length) {
        value += input[index + 1];
        index += 2;
        continue;
      }
      value += char;
      index += 1;
    }
    if (quoted) throw new QuerySyntaxError(`Unclosed quote at character ${offset + 1}`);
    if (value) tokens.push({ value, offset });
  }
  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): QueryExpression {
    if (!this.tokens.length) throw new QuerySyntaxError("Query is empty");
    const expression = this.parseOr();
    const token = this.peek();
    if (token) throw new QuerySyntaxError(`Unexpected "${token.value}" at character ${token.offset + 1}`);
    return expression;
  }

  private parseOr(): QueryExpression {
    let left = this.parseAnd();
    while (this.takeKeyword("OR")) {
      left = { type: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): QueryExpression {
    let left = this.parseUnary();
    while (true) {
      if (this.takeKeyword("AND")) {
        left = { type: "and", left, right: this.parseUnary() };
        continue;
      }
      const next = this.peek()?.value.toUpperCase();
      // Adjacent predicates imply AND, a familiar search syntax.
      if (next && next !== "OR" && next !== ")") {
        left = { type: "and", left, right: this.parseUnary() };
        continue;
      }
      return left;
    }
  }

  private parseUnary(): QueryExpression {
    if (this.takeKeyword("NOT")) {
      return { type: "not", expression: this.parseUnary() };
    }
    if (this.peek()?.value === "(") {
      this.position += 1;
      const expression = this.parseOr();
      if (this.peek()?.value !== ")") {
        throw new QuerySyntaxError("Missing closing parenthesis");
      }
      this.position += 1;
      return expression;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): QueryExpression {
    const token = this.tokens[this.position++];
    if (!token) throw new QuerySyntaxError("Expected a predicate");
    const colon = token.value.indexOf(":");
    if (colon <= 0 || colon === token.value.length - 1) {
      throw new QuerySyntaxError(
        `Expected field:value at character ${token.offset + 1}`,
      );
    }
    const field = token.value.slice(0, colon).toLowerCase() as QueryField;
    const supported: QueryField[] = [
      "text",
      "tag",
      "page",
      "map",
      "property",
      "task",
      "status",
    ];
    if (!supported.includes(field)) {
      throw new QuerySyntaxError(`Unknown query field "${field}"`);
    }
    const rawValue = token.value.slice(colon + 1);
    if (field === "property") {
      const equals = rawValue.indexOf("=");
      if (equals <= 0 || equals === rawValue.length - 1) {
        throw new QuerySyntaxError("Property predicates use property:key=value");
      }
      return {
        type: "predicate",
        field,
        propertyKey: rawValue.slice(0, equals),
        value: rawValue.slice(equals + 1),
      };
    }
    return { type: "predicate", field, value: rawValue };
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private takeKeyword(keyword: string): boolean {
    if (this.peek()?.value.toUpperCase() !== keyword) return false;
    this.position += 1;
    return true;
  }
}

export function parseQuery(input: string): QueryExpression {
  return new Parser(tokenize(input)).parse();
}

function includes(haystack: string | undefined, needle: string): boolean {
  return (haystack ?? "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function predicateMatches(
  expression: Extract<QueryExpression, { type: "predicate" }>,
  record: QueryRecord,
): boolean {
  const value = expression.value.toLocaleLowerCase();
  switch (expression.field) {
    case "text":
      return includes(record.text, value);
    case "tag":
      return (record.tags ?? []).some(
        (tag) => tag.replace(/^#/, "").toLocaleLowerCase() === value.replace(/^#/, ""),
      );
    case "page":
      return includes(record.page, value);
    case "map":
      return includes(record.map, value);
    case "property": {
      const entry = Object.entries(record.properties ?? {}).find(
        ([key]) => key.toLocaleLowerCase() === expression.propertyKey!.toLocaleLowerCase(),
      );
      return entry ? String(entry[1]).toLocaleLowerCase() === value : false;
    }
    case "task":
      return record.task === /^(true|yes|1|task)$/i.test(value);
    case "status":
      return (record.status ?? "").toLocaleLowerCase() === value;
  }
}

export function evaluateQuery(expression: QueryExpression, record: QueryRecord): boolean {
  switch (expression.type) {
    case "predicate":
      return predicateMatches(expression, record);
    case "and":
      return evaluateQuery(expression.left, record) && evaluateQuery(expression.right, record);
    case "or":
      return evaluateQuery(expression.left, record) || evaluateQuery(expression.right, record);
    case "not":
      return !evaluateQuery(expression.expression, record);
  }
}

export function runQuery(input: string, records: QueryRecord[]): QueryRecord[] {
  const expression = parseQuery(input);
  return records
    .filter((record) => evaluateQuery(expression, record))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Extract ```query fenced directives without executing their contents. */
export function extractQueryDirectives(markdown: string): string[] {
  const directives: string[] = [];
  const pattern = /```query\s*\n([\s\S]*?)```/gi;
  for (const match of markdown.matchAll(pattern)) {
    const query = match[1].trim();
    if (query) directives.push(query);
  }
  return directives;
}
