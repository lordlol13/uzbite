# UzBite AI Financial Controller & MCP Architecture

An AI-powered financial controller, multi-branch budget optimizer, and Tashkent geospatial demand analyzer built on **Coarena** (`gemini-3-8-flash`), deterministic TypeScript financial engines, Generative UI blocks, and a standalone **Model Context Protocol (MCP)** stdio server (`@uzbite/finance-mcp`).

Although showcased on a multi-branch Tashkent restaurant network (6 branches across 12 districts), the underlying financial, variance, audit, and multi-branch allocation engine is **domain-agnostic** and maps directly to **bank branch networks (BXM / BXO)**, retail chains, and franchise groups.

---

## 1. Architecture Overview

```text
+-----------------------------------------------------------------------+
|  Clients                                                              |
|  - UzBite Business Desktop (Electron + React + SVG Charts & Geo Map)  |
|  - External MCP Clients (Claude Desktop, Cursor, Antigravity)         |
+---------------------------+--------------------------+----------------+
                            | HTTPS / REST             | JSON-RPC 2.0
                            | JWT + X-Restaurant-Id    | stdio
                            v                          v
+--------------------------------------+   +----------------------------+
|  apps/backend (Express 5 + Prisma)   |   |  packages/finance-mcp      |
|  - /api/business/agent/chat          |<--|  Node built-ins only       |
|  - /api/business/agent/tools         |   |  initialize, tools/list,   |
|  - /api/business/agent/tools/call    |   |  tools/call, ping          |
|  - /api/business/agent/feedback      |   +----------------------------+
+------------------+-------------------+
                   |
       +-----------+-------------------------------+
       | 1. Deterministic Financial & Geo Engines  |
       |    (PostgreSQL -> verified GroundTruth)   |
       +-----------+-------------------------------+
                   |
       +-----------v-------------------------------+
       | 2. Coarena LLM Orchestrator               |
       |    Primary:  gemini-3-8-flash             |
       |    Fallback: deepseek-v4-1-flash-1017     |
       |              gpt-6-luna                   |
       |    Feedback: POST /v1/feedback            |
       +-----------+-------------------------------+
                   |
       +-----------v-------------------------------+
       | 3. Grounding Verifier & Generative UI     |
       |    verifyLlmNumbersAgainstGroundTruth()   |
       |    -> Verified Answer + AgentUiBlocks     |
       +-------------------------------------------+
```

### 1.1 Coarena LLM Layer (`apps/backend/src/services/coarena.ts`)

- **Endpoint**: `${COARENA_BASE_URL}/chat/completions` (defaults to `https://coarena.ai/api/v1`).
- **Primary Model**: `gemini-3-8-flash` (configured via `COARENA_MODEL`) with `reasoning_effort: 'low'` for low-latency interactive responses.
- **Automatic Free-Tier Fallback Chain**: If the primary model returns a transient/capacity status (`402`, `404`, `429`, `500`, `502`, `503`, `504`) or times out, `callCoarenaChat` automatically retries across:
  1. `gemini-3-8-flash`
  2. `deepseek-v4-1-flash-1017`
  3. `gpt-6-luna`
- **Feedback Loop (`/v1/feedback`)**: Every Coarena response captures `x-coarena-request-id` (or `json.id`) as `requestId`. When a user rates an answer thumbs-up/down in the UI, `POST /api/business/agent/feedback` forwards `{ request_id, rating, score, liked, thumb, comment }` to `${COARENA_BASE_URL}/feedback` via `submitCoarenaFeedback`.
- **Offline / No-Key Resilience**: If `COARENA_API_KEY` is missing or all upstream calls fail, `runFinanceAgentChat` seamlessly returns `source: 'heuristic'` using `buildDeterministicAgentAnswer(...)` alongside the full deterministic `uiBlocks`.

### 1.2 Deterministic Math & Grounding Verifier (`apps/backend/src/services/finance-agent.ts`)

Large language models must never perform raw accounting math or invent currency figures. UzBite enforces a strict **compute-first, narrate-second** pipeline:

1. **Parallel Tool Execution**: Backend tools execute against PostgreSQL/Prisma in parallel (`get_financial_overview`, `audit_expenses_and_waste`, `check_budget_execution`, `optimize_branch_budgets`, `analyze_district_orders`, `simulate_what_if_scenario`).
2. **GroundTruth Digest**: Verified numbers are packed into a compact `groundTruth` JSON payload passed to `gemini-3-8-flash`.
3. **Numeric Grounding Verification (`verifyLlmNumbersAgainstGroundTruth`)**:
   - `collectNumericValues(groundTruth)` extracts every verified numeric value (and its `/ 1,000` and `/ 1,000,000` scaled equivalents).
   - Before returning an LLM reply to the user, `verifyLlmNumbersAgainstGroundTruth` strips ISO dates (`YYYY-MM-DD`) and case tags (`#24`, `#25`, `#26`), parses all financial magnitudes `>= 1,000` UZS (including `млн` / `mln` / `million` / `тыс` / `ming` multipliers), and verifies each number lies within `max(2000, c * 0.025)` tolerance of a ground-truth value.
   - If any ungrounded number is found, the system automatically discards the hallucinated prose, falls back to the exact deterministic summary, and logs the rejected numbers in `toolTraces` (`"Fallback to exact numbers (rejected ...)"`).

---

## 2. Core Functional Pillars

### 2.1 Point 26 — Expense Audit, Anomaly Detection & Cost Optimization

Implemented across `apps/backend/src/services/finance-analysis.ts` and `audit_expenses_and_waste`:

- **Accounting Error Detection**:
  - `DUPLICATE_INVOICE`: Identical supplier, invoice number, or same-day/near-date identical amount.
  - `AMOUNT_MISMATCH`: Line total diverges from `quantity * unitPrice`.
  - `CATEGORY_MISMATCH`: Item name semantically belongs to a different `ExpenseCategory`.
  - `AMOUNT_OUTLIER` & `FUTURE_OR_INVALID_DATE`: Modified Z-score (`MAD`) outliers and invalid timestamps.
- **Operational Waste & Tariff Anomalies**:
  - `ADMIN_UTILITY_SPIKE`, `SUPPLIER_PRICE_SPIKE`, `CHEAPER_SUPPLIER_EXISTS`, `KITCHEN_COGS_VARIANCE`, `HIGH_FOOD_COST`, `HIGH_LABOR_COST`, `HIGH_PRIME_COST`, `NEGATIVE_MARGIN_DISH`, `HIGH_CANCELLATION`, `UNPAID_DELIVERED_ORDERS`.
  - Loss-making delivery districts (`deliveryMargin < 0`) from geo analytics are also surfaced as actionable cost-optimization recommendations.
- **Deduplicated Savings (`calculateDeduplicatedSavings`)**: Prevents double-counting overlapping findings on the same expense/category.
- **One-Click Remediation (`fix_finding`)**: Duplicate deletion, amount correction, and category reclassification are emitted as `AgentClientAction` buttons.

### 2.2 Point 25 — Budget Plan vs. Fact, Early Overrun Prediction & What-If Stress Tests

Implemented in `buildBudgetVarianceList` / `computeBudgetVarianceAndForecast` (`check_budget_execution`) and `simulateMacroScenario` (`simulate_what_if_scenario`):

- **Month-End Forecast Model**:
  - Fixed categories (`RENT`) keep `forecast = actual`.
  - Variable categories blend run-rate projection (`65%`: `(actual / elapsedDays) * daysInMonth`) with a **Theil-Sen robust trend** (`35%`: `actual + max(0, dailyBurnRate + slope * 0.25) * remainingDays`).
- **Exact Breach Date & Risk Scoring**:
  - Computes `projectedOverrun`, `daysUntilBreach`, `projectedBreachDate` (`YYYY-MM-DD`), and `riskLevel` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Price vs. Volume vs. New Items Decomposition**:
  - Guarantees the exact accounting identity vs. the prior month:
    `priceEffectUZS + volumeEffectUZS + newItemsEffectUZS === actual - prevActual`
  - Identifies `topSupplierName` and `topSupplierSpend` driving the variance.
- **Macro What-If Simulator**:
  - Stress-tests P&L under utility tariff hikes (`utilityTariffPct`), ingredient inflation (`foodInflationPct`), rent changes (`rentChangePct`), order volume shifts (`orderVolumeChangePct`), and menu price adjustments (`priceIncreasePct`).

### 2.3 Point 24 — Multi-Branch Budget Optimization (+ Bank BXM / BXO Model)

Implemented in `solveBranchBudgetAllocation` and `computeMultiBranchAllocation` (`optimize_branch_budgets`):

- **Branch Efficiency Scoring**: Evaluates each branch across:
  - **ROI %** (`netProfit / expenses`)
  - **Budget Discipline Score** (`100 - overrunCount * 15 - errorPenalty * 8`, clamped `[25, 100]`)
  - **Order Volume & Revenue Growth %**
  - **Local District Demand Score** from the Tashkent Geo Engine
- **Three Optimization Objectives**:
  - `profit`: weights ROI (`65%`), discipline (`25%`), volume (`10%`)
  - `balanced`: weights ROI (`40%`), discipline (`30%`), growth (`30%`)
  - `growth`: weights growth (`50%`), volume (`30%`), ROI (`20%`)
- **Constrained Pool Allocation**: Enforces a minimum stability floor (`45% / N` per branch) and concentration cap (`42%` of total pool), rebalances rounding residuals so `sum(recommendedBudget) === totalBudget`, breaks each branch's pool down into category limits (`categoryAllocations`), and emits a one-click `apply_branch_budgets` action.

#### Applicability to Bank Branches (BXM / BXO)

The exact same Point 24 / 25 / 26 engine applies without mathematical changes to a commercial bank's **BXM (Bank Xizmatlari Markazi)** and **BXO (Bank Xizmatlari Ofisi)** network:

| UzBite Concept | Bank BXM / BXO Equivalent |
| --- | --- |
| Restaurant Branch (`Restaurant`) | Regional BXM / BXO Office |
| Order Revenue & Avg Check | Net Interest Income + Fee/Commission Income per Client |
| Expenses (`SALARY`, `RENT`, `UTILITIES`, `COMMUNICATION`, `MARKETING`) | Branch OPEX (Staff Payroll, Office Lease, Electricity/HVAC, Leased Lines/Telecom, Local Acquisition) |
| Duplicate Invoices & Price Spikes | Vendor/Contractor Overbilling, Duplicate Facility Invoices, Abnormal Branch Utility Spikes |
| Budget Plan vs. Fact (`Point 25`) | Monthly Branch OPEX Limit vs. Run-Rate + Trend Overrun Alert |
| Multi-Branch Pool (`Point 24`) | Annual/Monthly OPEX & Marketing Budget Allocation Across BXM/BXO Units by ROI & District Demand |
| Tashkent 12-District Geo Map | Client Density, Underserved Neighborhoods & New BXM/BXO/ATM Placement Candidates |

### 2.4 Tashkent 12-District Geospatial Analytics

Implemented in `apps/backend/src/services/geo-districts.ts` and `packages/shared/src/index.ts`:

- **12 Official Tashkent Districts**: `olmazor`, `yunusobod`, `mirzo_ulugbek`, `shayxontohur`, `uchtepa`, `chilonzor`, `yakkasaroy`, `mirobod`, `yashnobod`, `sergeli`, `yangihayot`, `bektemir`.
- **Hybrid District Resolution (`resolveTashkentDistrict`)**: Matches district names in order address text, then executes ray-casting `pointInPolygon` against Tashkent district polygons, with Haversine nearest-center fallback.
- **Delivery Unit Economics**: Calculates per-district `avgDistanceKm`, `avgDeliveryMinutes`, `deliveryFeeRevenue`, `estimatedCourierCost` (`7,500 + distKm * 1,900` UZS), and `deliveryMargin`, classifying districts into `HIGH_DEMAND`, `PROFITABLE`, `UNDERSERVED`, or `LOSS_DELIVERY`.
- **Heatmap Grid Layer**: Aggregates spatial demand into ~500m grid cells (`heatmapCells`) for SVG heatmap visualization alongside branch service-area overlays.

### 2.5 Dashboard Control & Generative UI

The AI agent is an active UI controller, not a passive text box:

- **Screen Context Awareness (`AgentScreenContext`)**: Receives `activeTab`, `restaurantId`, `days`, `month`, `districtId`, and `summaryText` so users can ask *"What is on this screen?"* or *"Explain this chart"*.
- **Client Actions (`AgentClientAction`)**:
  - `navigate`: Switches desktop tabs (`dashboard`, `agent`, `audit`, `expenses`, `budgets`, `branches`, `map`, `sales`).
  - `set_filters`: Updates active branch, time window, month, or Tashkent district filter.
  - `highlight_widget` / `pin_widget`: Spotlights or pins Generative UI blocks onto the main dashboard.
  - `create_dashboard`: Generates custom multi-block dashboards persisted locally per branch.
  - `fix_finding` / `apply_branch_budgets`: Executes verified backend fixes or budget updates on click.

---

## 3. Security & Privacy Guarantees

1. **Server-Side API Keys Only**: `COARENA_API_KEY` is read exclusively by `apps/backend/src/config/env.ts` on the backend server. Neither the Electron renderer (`apps/desktop`) nor the standalone MCP server (`packages/finance-mcp`) ever holds LLM credentials.
2. **Aggregated Geo Analytics & K-Anonymity**: Geo endpoints (`GET /api/business/geo/districts`) and `map` UI blocks return only district-level totals and grid-rounded `heatmapCells` (suppressing sparse cells) — raw customer addresses, names, and phone numbers are never exposed to the LLM or map UI.
3. **Strict Grounding Guardrail**: `verifyLlmNumbersAgainstGroundTruth` blocks ungrounded/hallucinated currency figures from being presented as facts.
4. **Authenticated & Scoped Access**: All `/api/business/*` routes require a valid `RESTAURANT`-role JWT (`requireRestaurant`), and `resolveBusinessContext` scopes queries to authorized branches via `X-Restaurant-Id`. Demo auto-login (`{ demo: true }`) is blocked in production (`NODE_ENV === 'production'`).

---

## 4. 3-Minute Hackathon Pitch & Live Demo Script

> **Goal**: Show judges a complete, grounded, multilingual AI Financial Controller running live on real PostgreSQL data, Coarena `gemini-3-8-flash`, SVG Generative UI, Tashkent 12-district geo intelligence, and an external MCP client.

### 0:00 – 0:30 | Hook & Problem Statement
- **Narrative**: *"Businesses and bank branch networks (BXM/BXO) lose 8–15% of operating margin every month to silent leaks: duplicate supplier invoices, mid-month utility spikes, late budget overrun detection, and blind branch budget splits. Generic chatbots hallucinate numbers — UzBite computes exact accounting truth first, then lets `gemini-3-8-flash` reason, visualize, and control the app."*
- **Action**: Show the **Dashboard** tab (`Osh & Olov`) with KPI cards, prime cost, and health score.

### 0:30 – 1:10 | Point 26: AI Expense Audit & One-Click Fix
- **Action**: Open the **AI Agent** tab (or ask directly in Russian/Uzbek/English):
  - **Prompt (RU)**: `"Найди ошибки в расходах и где мы можем сэкономить прямо сейчас?"`
  - *(EN alt: `"Audit expenses for errors, duplicate invoices, and immediate savings."`)*
- **What to point out**:
  1. Parallel `toolTraces` showing `get_financial_overview` + `audit_expenses_and_waste` + `coarena:gemini-3-8-flash` with `"Grounded response (N verified figures)"`.
  2. Generative UI KPIs + findings table (`DUPLICATE_INVOICE`, `AMOUNT_MISMATCH`, `ADMIN_UTILITY_SPIKE`).
  3. Click a **`Fix` / `Удалить дубликат`** action button (`fix_finding`) to resolve an accounting error live.

### 1:10 – 1:50 | Point 25: Budget Overrun Forecast & Macro Stress Test
- **Prompt (RU)**: `"Какие категории пробьют бюджет до конца месяца и что будет, если электричество вырастет на 25%, а сырьё на 10%?"`
- *(EN alt: `"Which categories will breach budget this month, and what if utilities rise 25% and food costs 10%?"`)*
- **What to point out**:
  1. Grouped SVG **Budget Plan vs. Month-End Forecast** chart (`check_budget_execution`).
  2. Exact **projected breach date**, **Theil-Sen trend**, and **Price vs. Volume** decomposition with top supplier attribution.
  3. Instant **What-If P&L impact** card (`simulate_what_if_scenario`).

### 1:50 – 2:30 | Tashkent 12-District Geo Map & Point 24 Branch Allocation
- **Prompt 1 (Geo + UI Control)**: `"Открой карту Ташкента и покажи, откуда приходят клиенты и где убыточная доставка"`
  - Watch the agent **automatically navigate** to the Map tab (`control_app_dashboard`) and render the interactive **12-district Tashkent SVG map**, **~500m heatmap layer**, **branch service-area circles**, and **loss-making delivery zones**.
- **Prompt 2 (Point 24)**: `"Распредели бюджет 300 млн сум между всеми 6 филиалами по ROI и спросу"`
  - Point out how the **same allocation model** governs restaurant branches or **bank BXM/BXO branches**, then click **`Применить AI-бюджеты ко всем филиалам`** (`apply_branch_budgets`).

### 2:30 – 3:00 | Architecture, Grounding, Feedback & External MCP Close
- **Action**:
  1. Click thumbs-up on an AI response to show live **Coarena `/v1/feedback`** logging tied to `requestId`.
  2. Briefly mention (or show in terminal / Cursor / Claude Desktop) **`@uzbite/finance-mcp`**, our zero-dependency MCP stdio server exposing the exact same 10 financial & geo tools to any AI workspace.
  3. **Closing line**: *"Verified accounting math, zero hallucinated UZS figures, real-time UI control, and open MCP interoperability — ready for both HoReCa chains and bank BXM/BXO networks."*
