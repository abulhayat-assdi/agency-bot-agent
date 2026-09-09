# AI Analyst Architecture

Milestone 11 implements a grounded, read-only AI analyst surface. The analyst answers only after application-controlled analytics tools return evidence. If `OPENAI_API_KEY` is configured, the evidence is sent to OpenAI with strict instructions; otherwise the app returns a deterministic grounded response using the same evidence contract.

## Flow

```text
User question
→ intent classification
→ controlled read-only analytics tool calls
→ explicit evidence blocks with metric states/provenance/caveats
→ OpenAI response generation when configured, deterministic fallback otherwise
→ evidence displayed in the UI and returned by the API
```

## User surfaces

- `/ai-analyst` provides account/date/question controls, suggested prompts, grounded answer output, and visible evidence cards.
- `/api/ai/analyst` accepts a protected POST request with `question`, optional `accountId`, optional `adId`, and optional `preset`.
- `/ads/[adId]` now links `Analyze This Ad` to `/ai-analyst` with the selected ad constrained in the query string.

## Tool allowlist

Implemented tools are application analytics functions, not direct model access to the database or Meta API:

- `get_account_summary`
- `get_ad_performance`
- `get_trend`
- `get_top_entities`
- `get_bottom_entities`
- `get_anomalies`
- `get_data_availability`

Reserved/future tools from the original plan:

- `get_campaign_performance`
- `get_adset_performance`
- `get_breakdown`
- `compare_periods`
- `compare_entities`

The current implementation already uses report/trend/dashboard services that perform deterministic comparisons, rankings, anomaly checks, and sufficiency labels.

## Response requirements

For analytical answers, the system prompt requires the response to include:

1. Finding
2. Supporting evidence
3. Explanation
4. Recommendation or investigation point
5. Date range and timezone
6. Data sufficiency/data caveats

## Hallucination controls

- The model receives only curated JSON evidence from read-only app tools.
- Metric states are included with each evidence metric: available, actual zero, null, unavailable, unsupported, partial, insufficient data, or API error.
- The prompt explicitly forbids inventing metrics, dates, client names, account IDs, causes, and actual profit.
- Missing or unavailable metrics remain unavailable and are never converted to zero.
- Causal language must be cautious: `suggests`, `may be driven by`, or `is consistent with`.
- OpenAI failures fall back to deterministic grounded output instead of returning an ungrounded model answer.

## Individual ad analysis

`Analyze This Ad` on `/ads/[adId]` constrains the analyst to that ad's report context:

- client
- ad account ID/name/currency/timezone
- parent campaign
- parent ad set
- selected ad
- creative metadata
- deterministic ad metrics
- sufficiency state
- deterministic anomaly checks
- data caveats

Cross-entity recommendations are phrased as investigation points unless sibling evidence is explicitly returned by a future tool.

## Read-only safety

No Meta write tools exist. The analyst cannot create, edit, pause, resume, delete, change budgets, change targeting, modify creatives, or mutate campaign/ad set/ad state.

## Current persistence note

The database schema contains AI audit tables, but this milestone keeps the mock-backed analyst stateless because durable multi-user chat persistence belongs with later hardening/live integration work. The API and UI expose the full `GroundedAiContext`, so the evidence contract is ready for persistence in `ai_messages.grounded_context_json`.
