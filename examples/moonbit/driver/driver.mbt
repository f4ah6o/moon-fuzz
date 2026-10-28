///|
fn initialize() -> Int32 {
  1
}

///|
let initialized : Int32 = initialize()

///|
#export_name("fuzz_one")
pub fn fuzz_one(input : Bytes) -> Int32 {
  if initialized == 1 {
    @target.fuzz_one(input)
  } else {
    0
  }
}

///|
// The adapter invokes this only outside target execution.
#coverage.skip
#export_name("coverage_end")
pub fn coverage_end() -> Unit {
  @coverage.end()
}
