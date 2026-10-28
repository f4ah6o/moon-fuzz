# moon-fuzz

An early P0 experiment for a MoonBit fuzzing library and CLI. The current code
runs one supplied input against one JS target in a fresh Node.js process. It
separates target output from control messages, enforces startup and execution
deadlines, and saves failing inputs and diagnostic metadata. This is not yet a
coverage-guided fuzzer or the planned Rust CLI.

## Prerequisites

- Node.js 20 or later.
- For the MoonBit example, a MoonBit toolchain that supports `moon.mod`,
  `moon.pkg`, foreign-library exports, and the JS backend.

## Run the P0

The target is a CommonJS module exporting a synchronous `fuzz_one(Uint8Array)`
function. Return `0` for pass, `1` for reject, and `2` for a property failure.
Thrown errors, abnormal process exits, and execution timeouts are recorded as
findings. Invalid exports or return values and startup failures are infrastructure
errors. This integer interface is a temporary bridge, not the final SDK API.

```sh
printf '\002' > /tmp/moon-fuzz-input
node poc/cli.mjs run --module fixtures/target.cjs --input /tmp/moon-fuzz-input --out fuzz/artifacts/p0
```

The JSON result includes the finding directory. Its `input` file contains the
original bytes; `metadata.json`, `stdout.log`, and `stderr.log` contain the
observed result and bounded diagnostic output. Re-run with the same module and
limits, passing the saved `input` path to `--input`. Exit codes are 0 for pass
or reject, 1 for a finding, and 2 for infrastructure or usage errors.

Options: `--timeout` (execution milliseconds, default 1000),
`--startup-timeout` (milliseconds, default 5000), and `--out` (default
`fuzz/artifacts/p0`). Module loading is part of startup. Only the direct worker
is terminated: targets must not spawn child processes. This is process isolation,
not a security sandbox; run trusted targets only.

## MoonBit bridge experiment

`examples/moonbit` contains a foreign-library target with the same interface.
Build it with a compatible toolchain:

```sh
cd examples/moonbit
moon build --target js
```

Then pass the resulting JS artifact exporting `fuzz_one` to `--module`. The
artifact location and exact toolchain compatibility must be verified locally.
This example has **not** been built or run in the initial implementation
because the development environment did not have `moon` installed.

## Tests

```sh
npm test
```

The Node tests cover result classification, a synchronous infinite loop,
startup timeout, abnormal exit, bounded logs, saving raw bytes, and replay.
They use a JavaScript fixture; they do not verify MoonBit code generation or
coverage.

## Next milestones

1. Validate the MoonBit JS bridge and pin a working toolchain/runtime version.
2. Prove per-input coverage attribution and reset with `A → B → A`, including
   filtering out driver and initialization probes. Fail explicitly when coverage
   guidance is requested but cannot be verified.
3. Implement the planned Rust supervisor, corpus and mutation loop, failure
   signatures, reproducibility checks, and shrinking. Preserve input bytes
   independently of coverage collection, even on crash or timeout.
4. Add Wasm-GC, differential fuzzing, and structured generators after the JS
   path is verified.

The P0 does not yet record a build fingerprint or snapshot the target artifact;
reproduction depends on retaining the same target and environment. It does not
implement resource limits, process-tree termination, automatic build, mutation,
coverage, corpus management, shrinking, or regression checks.
