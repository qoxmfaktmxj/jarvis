// packages/ai/agent/tools/wiki-graph-query.ts
//
// graphify CLI 래퍼 — Jarvis 위키 지식 그래프 쿼리.
// Karpathy "LLM Wiki + Graphify" 패턴: neighbors/path/community/search 4가지 모드.
//
// 2026-05-11 (D4=A): wiki-page kind 노드에 대한 행 단위 sensitivity ACL 필터링
// 제거. graphify 빌드 산출물 자체가 workspace-scoped(`GRAPHIFY_GRAPH_PATH`)이고,
// tool 노출은 GRAPH_READ/ADMIN_ALL 권한 보유자에게만 허용된다 (ask-agent
// 메인 루프 P1 #3 참조). DB 의 page index 를 다시 조회해 페이지별 게이트를
// 거는 단계는 제거.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { ok, err, type ToolDefinition } from "./types.js";

const execFileP = promisify(execFile);
const TIMEOUT_MS = 5_000;

// ---- types ---------------------------------------------------------------

export interface WikiGraphQueryInput {
  mode: "neighbors" | "path" | "community" | "search";
  node?: string;
  target?: string;
  query?: string;
  budget?: number;
}

export interface GraphNodeRef {
  id: string;
  label: string;
  kind: string;
  source?: string;
}

export interface GraphEdgeRef {
  source: string;
  target: string;
  relation: string;
  confidence?: number;
}

export interface WikiGraphQueryOutput {
  nodes: GraphNodeRef[];
  edges: GraphEdgeRef[];
  summary?: string;
}

// ---- helpers -------------------------------------------------------------

function buildArgs(input: WikiGraphQueryInput, graphPath: string): string[] {
  const budget = String(input.budget ?? 1500);
  switch (input.mode) {
    case "neighbors":
      return ["query", `neighbors of ${input.node}`, "--graph", graphPath, "--budget", budget, "--json"];
    case "community":
      return ["query", `community of ${input.node}`, "--graph", graphPath, "--budget", budget, "--json"];
    case "path":
      return ["path", input.node!, input.target!, "--graph", graphPath, "--json"];
    case "search":
      return ["query", input.query!, "--graph", graphPath, "--budget", budget, "--json"];
  }
}

// ---- tool definition -----------------------------------------------------

export const wikiGraphQuery: ToolDefinition<WikiGraphQueryInput, WikiGraphQueryOutput> = {
  name: "wiki_graph_query",
  description:
    "graphify 지식 그래프 쿼리. neighbors/path/community/search 모드. raw files 대비 ~70x 토큰 절약.",
  parameters: {
    type: "object",
    required: ["mode"],
    properties: {
      mode: {
        type: "string",
        enum: ["neighbors", "path", "community", "search"],
        description: "쿼리 모드",
      },
      node: {
        type: "string",
        description: "neighbors / community / path(출발 노드) 시 사용",
      },
      target: {
        type: "string",
        description: "path 모드 도착 노드",
      },
      query: {
        type: "string",
        description: "search 모드 자연어 질문",
      },
      budget: {
        type: "integer",
        minimum: 100,
        maximum: 8000,
        default: 1500,
        description: "응답 토큰 한도",
      },
    },
  },

  async execute(input, _ctx) {
    // 1. graph.json 경로 결정 및 존재 확인
    const graphPath =
      process.env["GRAPHIFY_GRAPH_PATH"] ?? "graphify-out/graph.json";
    if (!existsSync(graphPath)) {
      return err("not_found", "graph.json not built — run /graphify first");
    }

    // 2. input 유효성 검사
    if (input.mode === "neighbors" || input.mode === "community") {
      if (!input.node) {
        return err("invalid", `${input.mode} requires 'node'`);
      }
    } else if (input.mode === "path") {
      if (!input.node || !input.target) {
        return err("invalid", "path requires 'node' and 'target'");
      }
    } else if (input.mode === "search") {
      if (!input.query) {
        return err("invalid", "search requires 'query'");
      }
    }

    // 3. CLI 실행
    try {
      const args = buildArgs(input, graphPath);
      const { stdout } = await execFileP("graphify", args, {
        timeout: TIMEOUT_MS,
        maxBuffer: 2_000_000,
      });

      // 4. stdout 파싱 — graphify-out 자체가 workspace-scoped 산출물이므로
      // 추가 DB 게이트 없이 그대로 반환.
      const raw = JSON.parse(stdout) as Partial<WikiGraphQueryOutput>;
      const nodes: GraphNodeRef[] = raw.nodes ?? [];
      const edges: GraphEdgeRef[] = raw.edges ?? [];

      return ok({ nodes, edges, summary: raw.summary });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = /timeout|ETIMEDOUT/i.test(msg) ? "timeout" : "unknown";
      return err(code, msg);
    }
  },
};
