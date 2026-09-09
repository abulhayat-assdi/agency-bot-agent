# AI Analyst Architecture

## Goal

Provide a grounded analyst that explains deterministic analytics without inventing account-specific facts.

## Flow

```text
User question
→ intent parsing and authorization
→ controlled read-only analytics tool calls
→ deterministic result set with provenance/caveats
→ OpenAI response generation
→ response saved with tool evidence
```

## Tool allowlist

- `get_account_summary`
- `get_campaign_performance`
- `get_adset_performance`
- `get_ad_performance`
- `get_breakdown`
- `get_trend`
- `compare_periods`
- `compare_entities`
- `get_top_entities`
- `get_bottom_entities`
- `get_anomalies`
- `get_data_availability`

All tools are read-only application analytics functions. No Meta write endpoints and no database mutations are available to the AI.

## Response requirements

For analytical answers, include where applicable:

1. Finding
2. Supporting evidence
3. Explanation
4. Recommendation or investigation point
5. Date range and timezone
6. Data sufficiency caveat

## Hallucination controls

- If account-specific data is unavailable, the AI must say so.
- The model receives unavailable/null/unsupported states explicitly.
- Prompting prohibits filling missing values or turning null into zero.
- The AI is not allowed to infer profit.
- For causal claims, use cautious language: "suggests", "may be driven by", "is consistent with".
- Tool results are persisted in `ai_messages.grounded_context_json` for auditability.

## Individual ad analysis

`Analyze This Ad` on `/ads/[adId]` constrains tool calls to that ad and its parent hierarchy/context. Cross-entity comparison is allowed only when explicitly part of the selected ad's context, e.g. comparing selected ad against sibling ads in the same ad set.
