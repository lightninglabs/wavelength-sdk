#pragma once

#import <Wavewalletdk/Wavewalletdk.h>
#include <concepts>

// gomobile exports C functions in a static framework. Check the actual public
// header so supported functions get strong references (even with dead stripping),
// while v0.2.1 never references an absent symbol.
template <typename Bytes = NSData>
struct WavelengthArkBindings {
  static constexpr bool supported = requires(Bytes *req, NSError *__autoreleasing *error) {
    { MobilePromoteVTXO(req, error) } -> std::same_as<NSData *>;
    { MobilePayOnActiveChannel(req, error) } -> std::same_as<NSData *>;
    { MobileReceiveOnActiveChannel(req, error) } -> std::same_as<NSData *>;
  };

  // Returns false only for names outside this feature. A recognized call on
  // incomplete bindings does no work; the bridge rejects it as unsupported.
  static bool dispatch(NSString *method, Bytes *req, NSData **result, NSError **error)
  {
    if ([method isEqualToString:@"promoteVTXO"]) {
      if constexpr (supported) *result = MobilePromoteVTXO(req, error);
    } else if ([method isEqualToString:@"payOnActiveChannel"]) {
      if constexpr (supported) *result = MobilePayOnActiveChannel(req, error);
    } else if ([method isEqualToString:@"receiveOnActiveChannel"]) {
      if constexpr (supported) *result = MobileReceiveOnActiveChannel(req, error);
    } else {
      return false;
    }
    return true;
  }
};
