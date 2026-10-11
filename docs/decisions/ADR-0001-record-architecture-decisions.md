# ADR-0001 Record architecture decisions in this folder

Date: 2026-10-10
Status: accepted
Deciders: Keshan
Backlog or WBS reference: WBS 2.1, PB-01

## Context

6 people build this product in 6 weeks across 2 stacks. Several choices that shape the
code were made before any code existed: FastAPI, PostgreSQL for stored data, Redis for
live room state, pdfplumber for page text, 1 AI interface with 2 providers, React with
Vite. More will be made in the weekly meetings.

The repository rules already require that decisions from a chat or a call go into the
decision log in `PLAN.md` on the same day, with the date, who decided and why. That log is
a good index, but a table row has no space for the context, the alternatives or the
consequences. Without that, a decision made in week 2 is re argued in week 4 by someone
who was not in the room.

## Decision

Decisions with a lasting technical effect get 1 file each in `docs/decisions`, numbered in
order, using `ADR-0000-template.md`. The decision log in `PLAN.md` stays as the index and
links to the file. Small decisions stay in the log only.

## Alternatives considered

| Option | Why it was not chosen |
|---|---|
| The `PLAN.md` log alone | A table row cannot hold the context and the alternatives, which is the part that stops a decision being re argued |
| A wiki or a document outside the repository | Drifts away from the code, and a new member does not find it |
| Comments in the code | Explains 1 file, not a choice that spans the system |

## Consequences

Writing a decision takes a few minutes. In return, anyone can read why a choice was made
without finding the person who made it. The template forces the alternatives to be written
down, which is the part people skip.

A decision is only useful if it is written on the day. A file created 2 weeks later is a
reconstruction, not a record.

## Review

If the folder is empty at the end of week 3 while decisions are clearly being made in
meetings, the process has failed and should be replaced with something lighter rather than
left to rot.
