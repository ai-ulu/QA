# Pilot Templates

## Repo Tracking Table

Use this for the first 5 to 8 pilot repos.

| Repo | Internal/External | Playwright Confirmed | CI Available | Recent Failures Seen | Buyer Guess | Status |
| --- | --- | --- | --- | --- | --- | --- |
| QA | Internal | Yes | Yes | Yes | QA/EM | Selected |
| frontend | Internal | Yes | Yes | Unknown | EM | Selected |
| tmp_flowgram | Internal | Yes | Yes | Unknown | QA/EM | Selected |
| cal.com | External | Yes | Yes | Yes | EM/VP Eng | Selected |
| payloadcms/payload | External | Yes | Yes | Yes | EM/VP Eng | Selected |
| strapi/strapi | External | Yes | Yes | Yes | EM/VP Eng | Reserve |
| n8n-io/n8n | External | Yes | Yes | Yes | EM/VP Eng | Reserve |

Day 1 locked pack:

- Internal selected: `QA`, `frontend`, `tmp_flowgram`
- External selected: `cal.com`, `payloadcms/payload`
- External reserve: `strapi/strapi`, `n8n-io/n8n`

## Daily Pilot Log

Copy per repo run:

```md
### Repo
- Name:
- Date:
- Operator:

### Trigger
- What changed:
- Why AutoQA was used:

### Output
- Did `impact` choose the right area?
- Did `suggest` produce a useful patch?
- Did `execute` run the right tests?
- Did `verify` increase confidence?
- Was CI summary useful?

### Human Decision
- Accepted as-is / edited / ignored:
- Why:

### Time
- Time to diagnosis:
- Time to patch:
- Time to confidence:

### Notes
- False positives:
- Missing signals:
- Follow-up needed:
```

## End-Of-Week Go/No-Go Memo

```md
# AutoQA Pilot Review

## Summary
- Decision: Go / Pilot Only / Stop-Reframe
- Dates:
- Repo count:

## What Worked
- 

## What Failed
- 

## Habit Signals
- Repeat uses:
- PR-visible usage:
- Nightly/CI usage:

## Buyer Reaction
- QA:
- EM:
- VP Eng:

## External Repo Result
- Repo:
- Outcome:
- Why it worked or failed:

## Next Sprint Focus
- Product capability / packaging / distribution / messaging
```
