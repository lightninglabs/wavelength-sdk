#import <Wavewalletdk/Wavewalletdk.h>
#include <cassert>

// Mode 0 uses the actual released header. Modes 1 and 2 add the public
// gomobile signatures for partial and complete builds, respectively.
#if ARK_ABI >= 1
static NSData *MobilePromoteVTXO(NSData *req, NSError **) { return req; }
#endif
#if ARK_ABI == 2
static NSData *MobilePayOnActiveChannel(NSData *, NSError **error)
{
  *error = [NSError errorWithDomain:@"daemon" code:7 userInfo:nil];
  return nil;
}
static NSData *MobileReceiveOnActiveChannel(NSData *, NSError **) { return [NSData data]; }
#endif

#include "../ios/WavelengthArkBindings.hpp"

int main()
{
  @autoreleasepool {
#ifdef LINK_RELEASED_RUNTIME
    // Force the static archive into the device/simulator link.
    (void)MobileIsRunning();
#endif
    using Bindings = WavelengthArkBindings<>;
    static_assert(Bindings::supported == (ARK_ABI == 2));
    NSData *req = [@"{\"memo\":\"caf\u00e9\"}" dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error = nil;
    NSData *result = nil;
    assert(!Bindings::dispatch(@"receive", req, &result, &error));
    assert(Bindings::dispatch(@"promoteVTXO", req, &result, &error));
    assert(error == nil && result == (Bindings::supported ? req : nil));
    assert(Bindings::dispatch(@"receiveOnActiveChannel", req, &result, &error));
    assert(error == nil && (result != nil) == Bindings::supported && result.length == 0);
    assert(Bindings::dispatch(@"payOnActiveChannel", req, &result, &error));
    assert(result == nil);
    if (Bindings::supported) {
      assert([error.domain isEqualToString:@"daemon"] && error.code == 7);
    } else {
      assert(error == nil);
    }
  }
}
