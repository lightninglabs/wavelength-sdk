#import <React/RCTEventEmitter.h>

// The codegen spec conformance is declared in the implementation file, not
// here: this public header must stay pure Objective-C so the pod's Clang
// module (required by the Swift ceremony source) can build without pulling
// in C++ codegen headers.
@interface WalletdkModule : RCTEventEmitter
@end
