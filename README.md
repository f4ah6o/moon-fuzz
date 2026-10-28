# moon-fuzz

An early P0 experiment for a MoonBit fuzzing library and CLI. The current code
runs one supplied input against one JS target in a fresh Node.js process. It
separates target output from control messages, enforces startup and execution
deadlines, and saves failing inputs and diagnostic metadata. An experimental
adapter collects MoonBit JS probe coverage. This is not yet a
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
or reject, 1 for a finding, and 2 for infrastructure or usage errors. If
coverage collection fails after a finding, the finding is saved and the exit
code is 2; its metadata includes `coverageError`.

Options: `--timeout` (execution milliseconds, default 1000),
`--startup-timeout` (milliseconds, default 5000), `--coverage-timeout`
(milliseconds, default 1000), `--guidance` (`none` by default or `coverage`),
`--coverage-package` (exact MoonBit package name), and `--out` (default
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

## Experimental JS coverage

The example also contains a separate instrumented driver. To collect feedback
for one input, build it with coverage and select the target package:

```sh
cd examples/moonbit
moon build --target js --enable-coverage
cd ../..
node poc/cli.mjs run --module examples/moonbit/_build/js/debug/build/driver/driver.js --input /tmp/moon-fuzz-input --guidance coverage --coverage-package f4ah6o/moon-fuzz-p0-example/target
```

An instrumented CommonJS driver must export a synchronous `coverage_end()`
that calls `@coverage.end()` and is marked `#coverage.skip`. The adapter relies
on the pinned runtime's `console.log` dump format. It discards the initial
dump, checks that counters reset, and selects counters whose package name
exactly matches `--coverage-package`. Results contain nonzero probe indices,
backend, and SHA-256 of the JS artifact. This hash identifies the entry artifact,
not the toolchain, runtime, external dependencies, or a complete build
fingerprint. Keep those inputs fixed when comparing features. Missing
instrumentation, malformed dumps, unexpected counter layouts, and failed
reset checks are infrastructure errors.

The integration test checks `A → B → A` in one instrumented instance and in
fresh workers, including target and driver initialization. These checks apply
to the example and pinned runtime; custom targets still need their own
attribution checks. Collection occurs only after the target returns or throws,
so a crash or timeout has no coverage. The adapter collects feedback but does
not yet use it for search.

## Tests

```sh
npm test
npm run test:moonbit
```

The first suite uses JavaScript fixtures. The second checks the toolchain
version, cleans and rebuilds the MoonBit example, and tests the generated
export and CLI outcomes, saved diagnostics, byte-for-byte inputs and replay.
The second suite also builds an instrumented example and tests coverage
attribution and failure handling. CI runs both suites on Ubuntu and macOS with
Node 20 and 22.

## Next milestones

1. Extend coverage attribution research to additional target and driver
   configurations and document supported environments and limitations.
2. Implement the planned Rust supervisor, corpus and mutation loop, failure
   signatures, reproducibility checks, and shrinking. Preserve input bytes
   independently of coverage collection, even on crash or timeout.
3. Add Wasm-GC, differential fuzzing, and structured generators after the JS
   path is verified.

The P0 does not yet record a build fingerprint or snapshot the target artifact;
reproduction depends on retaining the same target and environment. It does not
implement resource limits, process-tree termination, automatic build, mutation,
coverage-guided search, corpus management, shrinking, or regression checks.

## Implementation planning

The repository-local [implementation roadmap](issues/open/20261029-js-fuzzing-roadmap.md)
links the remaining implementation and research issues. Each issue records its
scope, dependencies, acceptance criteria, test plan, and changelog impact.
