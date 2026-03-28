# Pilot Templates

## Repo Tracking Table

Use this for the first 5 to 8 pilot repos.

| Repo | Internal/External | Playwright Confirmed | CI Available | Recent Failures Seen | Buyer Guess | Status |
| --- | --- | --- | --- | --- | --- | --- |
| QA | Internal | Yes | Yes | Yes | QA/EM | Planned |
| frontend | Internal | Yes | Partial | Unknown | EM | Planned |
| tmp_flowgram | Internal | Yes | Unknown | Unknown | QA/EM | Planned |
| StackMemory frontend | Internal | Yes | Unknown | Unknown | Founder/EM | Planned |

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
