# 真实 LLM Query 压测 Implementation Plan

> **For agentic workers:** Use inline execution or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 新增 `07-query-llm` 预发档真实 query 压测（多用户固定次数 + 熔断），独立 `pnpm loadtest:llm`。

**Architecture:** 复用现有 k6 auth/config/runner；setup 用户池每 VU 一用户；`mode=query` 入队后轮询终态。

**Tech Stack:** k6, Better Auth, 现有 loadtest runner

**Spec:** `docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md`

---

### Task 1: env 示例 + README + config 阈值

- Create: `loadtest/.env.loadtest.llm.example`
- Modify: `loadtest/README.md`, `loadtest/k6/lib/config.js`（llm 阈值与常量）
- Commit: `docs(loadtest): document real-LLM query staging profile`

### Task 2: userPool + 07-query-llm

- Create: `loadtest/k6/lib/userPool.js`, `loadtest/k6/scenarios/07-query-llm.js`
- Defaults: LLM_USERS=30, LLM_ITERS_PER_USER=2, timeout 180s, checks≥90%
- Commit: `feat(loadtest): add multi-user real-LLM query scenario`

### Task 3: npm script + 小跑/全量 + 报告

- Modify: `package.json` (`loadtest:llm`)
- Run smoke 5×1 then default or reduced staging; write report
- Commit: `docs: add real-LLM query loadtest report`
