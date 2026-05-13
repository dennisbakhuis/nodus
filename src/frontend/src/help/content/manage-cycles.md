# Cycles

A **cycle** is one round of radar assessment — typically run quarterly or
biannually. Each cycle has a name, a start date, a theme colour, and a set
of deliverables (the radar snapshot, summary brief, etc.).

## Creating a cycle

Click **New cycle**, give it a name (e.g. _2026 H1_), pick a start date,
and choose a colour. The new cycle becomes the _current_ cycle automatically
and is what users see when they visit `/radar`.

## Closing a cycle

When a cycle ends, click **Close**. Closing freezes the cycle so it can no
longer be edited. The radar snapshot for that moment in time remains
viewable from the cycle picker in the radar sidebar.

> Closing a cycle is reversible only by an admin via the API. Treat it as
> final.

## Deliverables

Each cycle exposes downloadable deliverables — for example a JSON snapshot
of the radar and a generated summary brief. These are produced on demand
when first requested.
