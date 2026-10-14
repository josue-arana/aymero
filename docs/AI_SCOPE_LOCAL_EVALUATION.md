# Local AI Scope Evaluation

The evaluation runner compares the legacy and controlled Scope Assistant pipelines without deploying an Edge Function, modifying remote configuration, or reading/writing estimate records. It imports the same versioned instructions, request builders, strict parsers, validation contracts, and provider transport used by the production Edge Function.

## Source readiness

The fixture contract separates:

- `originalSource`: the text supplied to both pipelines;
- `sourceStatus`: whether the text is verified as `verbatim_historical`;
- `laterConfirmedFacts`: facts learned later and never supplied to either comparison pipeline;
- `expectedInterpretation`: deterministic review expectations;
- `evaluationAssertions`: expected terminology and unsupported wording checks.

Sprint 3.53F.2a.2 restored the verbatim historical descriptions for Cases A–C. Case D remains unchanged. All four cases are marked `verbatim_historical`, and deterministic SHA-256 assertions protect their exact source text from silent edits. The runner still refuses paid execution if any selected source loses that status.

For Case C, the later laminate confirmation is stored only in `laterConfirmedFacts`. It is not appended to the historical input sent to either pipeline.

## Request budget

Each case makes exactly five requests with no retries:

1. Legacy Spanish professionalization
2. Controlled construction interpretation
3. Controlled Spanish professionalization
4. Legacy English translation of the legacy Spanish candidate
5. Controlled English translation of the controlled Spanish candidate

Batch 1 contains roof replacement and cabinet hardware. Batch 2 contains kitchen quartz and kitchen flooring. Each batch therefore requires exactly 10 requests. The runner rejects any request cap other than 10 and never runs both batches automatically.

## Zero-request readiness checks

These commands inspect the batch plan and source readiness without reading credentials or making provider requests:

```sh
npm run evaluate:ai-scope-pipelines -- --batch 1 --request-cap 10
npm run evaluate:ai-scope-pipelines -- --batch 2 --request-cap 10
```

## Required environment variables

Live execution, only after explicit authorization and verbatim source restoration, requires:

- `OPENAI_API_KEY`: a separate non-production key supplied to the process environment;
- `AI_SCOPE_EVALUATION_MODEL`: the explicitly selected model identifier.

Do not put either value in fixture files, committed `.env` files, command arguments, or terminal output. A developer can enter the key without echoing it:

```sh
read -s "OPENAI_API_KEY?Non-production OpenAI API key: "
export OPENAI_API_KEY
export AI_SCOPE_EVALUATION_MODEL="approved-evaluation-model"
```

After the run, remove the process values:

```sh
unset OPENAI_API_KEY AI_SCOPE_EVALUATION_MODEL
```

Model access is confirmed only by an explicitly authorized live run. Source configuration alone cannot prove access.

## Batch 1 execution command for later

Do not run this until live testing is explicitly authorized and a separate non-production key and approved model are configured:

```sh
npm run evaluate:ai-scope-pipelines -- --batch 1 --request-cap 10 --execute
```

Batch 2 uses the same command with `--batch 2`. Run each batch separately.

## Results

Successful and partial runs produce a mode-`0600` JSON report and a Markdown report in a mode-`0700` timestamped directory under the operating system temporary directory unless `--output-dir` is explicitly provided. Reports contain source text, later confirmations, generated outputs, review warnings, structured interpretation, instruction versions, model identifier, per-stage usage, latency, request count, and sanitized errors. API keys and authorization headers are never included.

Cost remains `null` until current pricing for the selected model is verified. The runner does not invent or accept an implicit price.
