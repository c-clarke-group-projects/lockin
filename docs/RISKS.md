# Risks

Source: section 13 of the MVP proposal, plus the risks that come from the 6 week plan
rather than the product. Reviewed in the weekly meeting, WBS 1.1.3.

A risk with no owner is not managed. Update the status every week and write any change
into `docs/WORKLOG.md`.

Status values: open, watching, closed, happened.

## Product risks

| # | Risk | Mitigation | Owner | Status |
|---|---|---|---|---|
| R1 | AI writes wrong questions | Host review step, snippet check in validation, challenge button during the reveal, void with a points refund |  | Open |
| R2 | Free AI limits are reached during a demo or the trial | Generate and cache quizzes before the demo. Live play uses no AI at all, so a limit cannot interrupt a running game |  | Open |
| R3 | Scanned PDFs produce no text | Detect pages with almost no text, tell the host clearly which pages were skipped. OCR is version 2 |  | Open |
| R4 | Weak school internet during the trial | Small WebSocket messages, reconnect on drop, rejoin the same seat with the same name and code |  | Open |
| R5 | Cheating with a second device or a search | Server side timing and short timers. Shuffled option order per device is version 2, PB-44 |  | Open |
| R6 | Competitors copy the features | Focus on the teacher feedback loop and the trial relationships, which take longer to copy than a single feature | Team | Watching |

## Delivery risks from the 6 week plan

| # | Risk | Mitigation | Owner | Status |
|---|---|---|---|---|
| R7 | The proposal estimated an 8 week build. This plan fits it into 5 weeks | Scope is fixed at the 8 MVP features. Anything else goes to version 2 without discussion. Review progress against MS1 at the end of week 4 and cut scope rather than quality |  | Open |
| R8 | Hosting cost is not approved in time for week 6 | Keep the local setup fully working so the trial can run on a laptop on the same network. Ask for approval in week 5, decision D3 |  | Open |
| R9 | The WebSocket message list changes after backend and frontend have built against it | Agree it in week 1, change it only by pull request, announce every change to both sides |  | Open |
| R10 | A member is blocked or unavailable for a week | Raise it in the weekly meeting, reassign within the same stack. Week 1 design documents mean someone else can pick the work up |  | Open |
| R11 | The 30 device load test fails in week 5 with no time to fix it | Test with the devices the team already has as soon as the live game works in week 4, rather than waiting for week 5 |  | Open |
| R12 | Real student data reaches the AI provider during the trial | Only material text is ever sent, never names, answers or results. Hosts are told what happens to their uploaded material. Agree the retention period, decision D4, before the trial |  | Open |
| R13 | Nobody is found to run the trial with | Start asking in week 3, not week 6. Decision D6 |  | Open |

## Verification note

The differentiators in section 3 of the proposal were not checked against every competitor.
Kahoot was checked in October 2026. Wayground, Blooket, Gimkit and Mentimeter were not.
Do not claim any feature is unique in the final report, the user guide or the trial
material until that check is done and recorded here.
