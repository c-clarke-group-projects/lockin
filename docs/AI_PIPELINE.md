# AI question generation

Source: section 8 of the MVP proposal, WBS 3.3, backlog PB-06 to PB-09. Owner   .

AI is used only when a quiz is created, never during live play. A typical PDF needs about
5 to 10 calls, after which the quiz is stored and replayed with no further AI use. That is
what makes a free tier practical for the MVP, and it is also why a demo can never be
blocked by a rate limit: generate and cache the quiz beforehand.

## 1. The 5 steps

### 1. Extract

Read the text of the PDF page by page with pdfplumber and store each page with its page
number. A page with almost no text is marked as skipped, logged, and shown to the host as a
skipped page. It is almost certainly a scanned image, and OCR is a version 2 item.

### 2. Chunk

Group pages into chunks of a safe size for the model, keeping the page number attached to
every piece of text. The page number has to survive this step, because source linking is
the product.

### 3. Generate

Ask the model for a batch of questions per chunk, in strict JSON. Each question must come
back with the question text, exactly 4 options, the correct option, the page number it used
and a short quote from that page.

The host chooses how many questions to generate, between 5 and 30. Generation runs in
batches and the results open on the review screen.

### 4. Validate

Reject a question if any of these are true. Nothing that fails reaches the host.

| Check | Reject when |
|---|---|
| JSON | The response is not valid JSON or does not match the agreed shape |
| Option count | There are not exactly 4 options |
| Duplicate options | 2 options are the same |
| Correct answer | The correct option is missing, or is not 1 of the 4 |
| Snippet | The returned quote is not found in the text of the page it claims |
| Page number | The page number is not a real page of this material |
| Empty fields | The question text or any option is empty |

Every rejection is logged with the reason and the question that caused it.

### 5. Review

Valid questions are shown to the host with their source page, so the host can edit, delete
or regenerate before saving. Regenerate replaces 1 question only.

## 2. Reliability rules

These are not optional, they are repository rules.

- Every call has a timeout, read from `AI_TIMEOUT_SECONDS`.
- Rate limit errors retry with backoff up to `AI_MAX_RETRIES`, then stop.
- A partial failure returns the questions that did succeed and tells the host how many
  failed. It does not throw away a good batch.
- The log records what was sent, what came back and what was skipped or rejected. What was
  sent means the file name and the page range, not the full text of the material.

## 3. Provider switch

1 interface, 2 implementations, chosen by the `AI_PROVIDER` environment variable. Both
return the same question shape, so the rest of the system does not know which one ran. The
API key is read from the environment and never stored in the repository.

| | Gemini free tier | Ollama, local model |
|---|---|---|
| Cost | No billing account needed to start | Software and open models are free. Needs hardware |
| Quality | Good for question writing | Small models, 3B to 8B, produce more wrong answers and weaker options |
| Limits | Request limits vary by model and project. Check the current values before relying on them | Limited only by hardware speed |
| Data privacy | On the free quota Google may use inputs and outputs to improve its products, and human reviewers may read them. Google advises not to send personal or confidential data | Data stays on our own machine |
| Use it for | Demos and a small trial with non personal material | Daily development and testing |

Choosing the provider for the trial is open decision D2 in `PLAN.md`.

## 4. Privacy

Only the text of the host's uploaded material is sent to the provider, and only while a
quiz is being created. Participant names, answers and results are never sent to the AI.

If the Gemini free tier is used with real users, the host must be told clearly that their
uploaded material is processed by Google and may be used to improve Google products.

## 5. The prompt and the output format

The agreed prompt and the JSON output shape are a week 1 deliverable, WBS 2.2.3, tested on
3 sample PDFs with Ollama before any backend work starts. They live with the AI service
once the code exists. Until then, any change to the shape is announced to the team, because
the validation rules above depend on it.

## 6. Known risk

AI generated questions are sometimes wrong. The product answer is not a better prompt, it
is the trust loop: the snippet check in validation, the host review step, the challenge
button during the reveal, and void with a points refund. A question that slips through all
of those still gets caught by the room.
