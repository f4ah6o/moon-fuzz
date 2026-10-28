# moon-fuzz

An early P0 experiment for a MoonBit fuzzing library and CLI. The current code
runs one supplied input against one JS target in a fresh Node.js process. It
separates target output from control messages, enforces startup and execution
deadlines, and saves failing inputs and diagnostic metadata. This is not yet a
coverage-guided fuzzer or the planned Rust CLI.

## Prerequisites

- Node.js 20 or later.
- For the MoonBit example and acceptance tests, MoonBit toolchain and core
  `0.10.17+d971670cd` (moon `0.1.20261023`, commit `3778465`).
  CI installs both with the official installer:

  ```sh
  curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s -- '0.10.17+d971670cd'
  export PATH="$HOME/.moon/bin:$PATH"
  ```

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

## MoonBit JS target

`examples/moonbit` declares a `foreign_library` with `#export_name("fuzz_one")`
and builds a CommonJS module. Build it with the pinned toolchain:

```sh
cd examples/moonbit
moon build --target js
```

The artifact is `examples/moonbit/_build/js/debug/build/target/target.js`.
Node can load it with `require(path).fuzz_one(Uint8Array)`; MoonBit `Bytes`
maps to `Uint8Array` in the JS backend. From the repository root:

```sh
printf '!' > /tmp/moon-fuzz-input
node poc/cli.mjs run --module examples/moonbit/_build/js/debug/build/target/target.js --input /tmp/moon-fuzz-input
```

The example returns failure for `!` or the four bytes `42 00 ff 2a` (hex),
reject for `R`, and pass otherwise. `H` loops in MoonBit and `X` calls
`process.exit(17)` through a JS FFI function to exercise timeout and abnormal
exit handling. These branches are deliberately added for acceptance testing.

## Tests

```sh
npm test
npm run test:moonbit
```

The first suite uses JavaScript fixtures. The second checks the toolchain
version, cleans and rebuilds the MoonBit example, and tests the generated
export and CLI outcomes, saved diagnostics, byte-for-byte inputs and replay.
CI runs both suites on Ubuntu and macOS with Node 20 and 22. Neither suite
collects coverage feedback.

## Next milestones

1. Prove per-input coverage attribution and reset with `A → B → A`, including
   filtering out driver and initialization probes. Fail explicitly when coverage
   guidance is requested but cannot be verified.
2. Implement the planned Rust supervisor, corpus and mutation loop, failure
   signatures, reproducibility checks, and shrinking. Preserve input bytes
   independently of coverage collection, even on crash or timeout.
3. Add Wasm-GC, differential fuzzing, and structured generators after the JS
   path is verified.

The P0 does not yet record a build fingerprint or snapshot the target artifact;
reproduction depends on retaining the same target and environment. It does not
implement resource limits, process-tree termination, automatic build, mutation,
coverage, corpus management, shrinking, or regression checks.
