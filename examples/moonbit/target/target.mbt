///|
fn initialize_target() -> Bool {
  true
}

///|
let target_initialized : Bool = initialize_target()

///|
extern "js" fn exit_abnormally() -> Unit =
  #|() => process.exit(17)

///|
#export_name("fuzz_one")
pub fn fuzz_one(input : Bytes) -> Int32 {
  if input.length() == 0 {
    return 0
  }
  if input[0] == b'!' {
    return 2
  }
  if input[0] == b'R' {
    return 1
  }
  if input[0] == b'X' {
    exit_abnormally()
  }
  if input[0] == b'H' {
    while true {

    }
  }
  if target_initialized &&
    input.length() == 4 &&
    input[0] == 0 &&
    input[1] == 255 &&
    input[2] == 128 &&
    input[3] == 42 {
    return 1
  }
  if input.length() == 4 &&
    input[0] == b'B' &&
    input[1] == b'\x00' &&
    input[2] == b'\xff' &&
    input[3] == b'*' {
    return 2
  }
  0
}
