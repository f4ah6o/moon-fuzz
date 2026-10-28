#export_name("fuzz_one")
pub fn fuzz_one(input : Bytes) -> Int {
  if input.length() > 0 && input[0] == b'!' {
    2
  } else {
    0
  }
}
