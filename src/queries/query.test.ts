import { describe, expect, it } from "vitest";
import {
  evaluateQuery,
  extractQueryDirectives,
  parseQuery,
  QuerySyntaxError,
  runQuery,
  type QueryRecord,
} from "./query";

const records: QueryRecord[] = [
  {
    id: "b",
    text: "Ship release",
    tags: ["work", "urgent"],
    page: "Roadmap",
    properties: { owner: "Elijah", priority: 2 },
    task: true,
    status: "doing",
  },
  {
    id: "a",
    text: "Read a book",
    tags: ["personal"],
    page: "Inbox",
    map: "Leisure",
    task: true,
    status: "todo",
  },
];

describe("local queries", () => {
  it("parses precedence, grouping, implicit AND, and NOT", () => {
    const expression = parseQuery(
      'tag:work (status:doing OR status:todo) NOT text:"cancelled item"',
    );
    expect(evaluateQuery(expression, records[0])).toBe(true);
    expect(evaluateQuery(expression, records[1])).toBe(false);
  });

  it("evaluates every initial predicate and returns deterministic order", () => {
    expect(runQuery("task:true OR map:leisure", records).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(runQuery("property:owner=elijah AND property:priority=2", records)).toEqual([
      records[0],
    ]);
    expect(runQuery("page:road tag:#urgent status:doing", records)).toEqual([records[0]]);
  });

  it("rejects malformed and unknown syntax without eval", () => {
    expect(() => parseQuery("unknown:value")).toThrow(QuerySyntaxError);
    expect(() => parseQuery("property:key")).toThrow("property:key=value");
    expect(() => parseQuery("(tag:work")).toThrow("closing parenthesis");
  });

  it("extracts fenced query directives", () => {
    expect(
      extractQueryDirectives("Before\n```query\ntag:work AND status:todo\n```\nAfter"),
    ).toEqual(["tag:work AND status:todo"]);
  });
});
