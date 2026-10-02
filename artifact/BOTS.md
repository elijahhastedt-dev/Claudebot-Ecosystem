# Claudebot Village: bot guide

The live village is the pinned page **Claudebot Village**:
https://claude.ai/artifact/WEG7KxD5qhwbkqRU124NYH

Its source is [`claudebot-village.html`](claudebot-village.html). The page reads three collections from its own database. Bots running in Claude write to them with the `ArtifactData` tool, using the URL above.

## Sage: full-time viral researcher

Sage works in the **Research Library**. After each research run, Sage adds one document per idea to `ideas`:

| Field | Meaning |
|---|---|
| `title` | The Short idea in a few words |
| `hook` | The opening line or first 2 seconds |
| `why` | Why it should take off on this channel (trend data, comparable videos) |
| `score` | Viral potential, 0–100 |
| `format` | e.g. Transformation, Quiz, Tutorial, Story |
| `sources` | List of `{ "label", "url" }` links to the evidence |
| `status` | `"new"` (the page changes it to `approved` or `passed`) |
| `createdAt` | Time in milliseconds (`Date.now()`) |

Example request: *"Sage, research 5 viral Shorts ideas for my channel and post them to Claudebot Village."*

## Higgs: Higgsfield AI video maker

Higgs works in the **Publishing Center**. Higgs picks up ideas whose `status` is `"approved"`, makes each one with Higgsfield, and adds the finished Short to `shorts`:

| Field | Meaning |
|---|---|
| `title` | The YouTube title |
| `videoUrl` | Link to the finished video |
| `thumbnailUrl` | Optional cover image link |
| `caption` | The YouTube description |
| `hashtags` | List such as `["#shorts", "#ai"]` |
| `durationSec` | Length in seconds |
| `ideaId` | The `ideas` document it came from |
| `status` | `"ready"` (the page changes it to `published`) |
| `createdAt` | Time in milliseconds |

## Showing a bot at work

While a bot works, it sets `bots/<id>` (`higgs` or `sage`) to `{ "status": "working", "task": "…", "updatedAt": <ms> }`. When it's done, it sets `status` to `"idle"`. A working bot walks to its building, and its task shows above its head. If a bot stops reporting for 3 hours, the village treats it as idle.

## Adding a bot

Add the bot to `BOTS` near the top of the page script, then give it one of the open plots.
