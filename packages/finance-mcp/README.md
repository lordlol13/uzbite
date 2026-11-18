# `@uzbite/finance-mcp`

Standalone Model Context Protocol (MCP) stdio server for the **UzBite AI Financial Controller** (`apps/backend`).

It exposes the verified UzBite MCP toolset (`GET /api/business/agent/tools` and `POST /api/business/agent/tools/call`) over JSON-RPC 2.0 stdio (supporting both newline-delimited JSON-RPC and `Content-Length` framing) using only Node.js built-ins.

## Exposed Tools

| Tool | Category | Purpose |
| --- | --- | --- |
| `get_financial_overview` | `point_26` | Revenue, expenses, net profit, food/labor/admin %, and break-even KPIs for a branch. |
| `audit_expenses_and_waste` | `point_26` | Duplicate invoices, amount/category errors, supplier price spikes, utility anomalies, and deduplicated UZS savings. |
| `check_budget_execution` | `point_25` | Planned vs actual budget, month-end forecast, exact breach date, and price vs volume variance decomposition. |
| `optimize_branch_budgets` | `point_24` | Rank branches by ROI, budget discipline, and demand; compute optimal multi-branch budget allocation. |
| `analyze_district_orders` | `geo_map` | Order density, revenue, delivery distance, courier margin, and underserved zones across Tashkent's 12 districts. |
| `order_heatmap` | `geo_map` | Privacy-safe k-anonymous ~500m (`0.005 deg`) grid heatmap cells of Tashkent order density and revenue. |
| `branch_catchment` | `geo_map` | Branch service-area catchment (orders and revenue within vs. outside `radiusKm`) and top districts served. |
| `find_growth_districts` | `geo_map` | Rank Tashkent districts by expansion/marketing opportunity score based on demand, branch distance, and delivery margin. |
| `simulate_what_if_scenario` | `point_25` | Macro stress-test for utility tariff hikes, food inflation, rent changes, or order growth. |
| `control_app_dashboard` | `ui_control` | Structured UI navigation/filter/highlight command descriptor. |

*(The live tool list is dynamically fetched from `GET /api/business/agent/tools` on the running backend, so any newly added backend MCP tools appear automatically.)*

## Build

From the repository root:

```bash
npm run typecheck -w @uzbite/finance-mcp
npm run build -w @uzbite/finance-mcp
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `UZBITE_API_BASE_URL` | `http://127.0.0.1:8081` | Base URL of the UzBite backend API. |
| `UZBITE_BUSINESS_TOKEN` | — | Bearer JWT obtained from `POST /api/business/auth/login`. Recommended outside local dev. |
| `UZBITE_DEMO_LOGIN` | `false` | Set to `true` in local development to auto-login via `POST /api/business/auth/login` with `{ "demo": true }` and refresh on `401`. |
| `UZBITE_RESTAURANT_ID` | — | Optional branch ID or slug forwarded as `X-Restaurant-Id` (e.g. `rest-osh`, `rest-basilico`). |
| `UZBITE_MCP_TIMEOUT_MS` | `20000` | Upstream HTTP timeout in milliseconds. |

## Client Configuration Snippets

Replace `C:/Users/Muzaffar/Desktop/Uzbite-main` with your local path to the repository.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "uzbite-finance": {
      "command": "node",
      "args": [
        "C:/Users/Muzaffar/Desktop/Uzbite-main/packages/finance-mcp/dist/index.js"
      ],
      "env": {
        "UZBITE_API_BASE_URL": "http://127.0.0.1:8081",
        "UZBITE_DEMO_LOGIN": "true",
        "UZBITE_RESTAURANT_ID": "rest-osh"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "uzbite-finance": {
      "command": "node",
      "args": [
        "packages/finance-mcp/dist/index.js"
      ],
      "env": {
        "UZBITE_API_BASE_URL": "http://127.0.0.1:8081",
        "UZBITE_DEMO_LOGIN": "true",
        "UZBITE_RESTAURANT_ID": "rest-osh"
      }
    }
  }
}
```

### Antigravity (`mcp_config.json`)

```json
{
  "mcpServers": {
    "uzbite-finance": {
      "command": "node",
      "args": [
        "C:/Users/Muzaffar/Desktop/Uzbite-main/packages/finance-mcp/dist/index.js"
      ],
      "env": {
        "UZBITE_API_BASE_URL": "http://127.0.0.1:8081",
        "UZBITE_BUSINESS_TOKEN": "<paste-your-business-jwt-here>",
        "UZBITE_RESTAURANT_ID": "rest-osh"
      }
    }
  }
}
```

## Quick Stdio Smoke Test

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | UZBITE_DEMO_LOGIN=true node packages/finance-mcp/dist/index.js
```
