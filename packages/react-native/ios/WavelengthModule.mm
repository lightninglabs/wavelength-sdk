#import "WavelengthModule.h"

#import <Wavewalletdk/Wavewalletdk.h>
#import <WavelengthSpec/WavelengthSpec.h>
#import "WavelengthReactNative-Swift.h"

// The single device event name; the body is { kind, payload }.
static NSString *const kWavelengthEvent = @"wavelengthActivity";
static NSString *const kWavelengthErrorCode = @"wavelength_error";

// The codegen spec conformance lives here (see the note in the header): the
// generated protocol drags in C++ headers that must stay out of the public
// Objective-C surface.
@interface WavelengthModule () <NativeWavelengthSpec>
@end

@implementation WavelengthModule {
  MobileSubscription *_subscription;
  WavelengthPasskey *_passkey;
}

RCT_EXPORT_MODULE(Wavelength)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kWavelengthEvent ];
}

- (void)getDefaultDataDir:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  NSURL *appSupport = [[NSFileManager.defaultManager
      URLsForDirectory:NSApplicationSupportDirectory
             inDomains:NSUserDomainMask] firstObject];
  resolve([appSupport URLByAppendingPathComponent:@"wavelength"].path);
}

- (void)passkeySupported:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  resolve(@([WavelengthPasskey prfSupported]));
}

- (void)passkeyCreate:(NSString *)requestJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    @synchronized (self) {
      if (self->_passkey == nil) {
        self->_passkey = [WavelengthPasskey new];
      }
    }
    [self->_passkey create:requestJson
                completion:^(NSString *json, NSString *errorMessage) {
      if (json != nil) {
        resolve(json);
      } else {
        reject(kWavelengthErrorCode,
               errorMessage ?: @"passkey ceremony failed", nil);
      }
    }];
  });
}

- (void)passkeyGet:(NSString *)requestJson
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    @synchronized (self) {
      if (self->_passkey == nil) {
        self->_passkey = [WavelengthPasskey new];
      }
    }
    [self->_passkey get:requestJson
             completion:^(NSString *json, NSString *errorMessage) {
      if (json != nil) {
        resolve(json);
      } else {
        reject(kWavelengthErrorCode,
               errorMessage ?: @"passkey ceremony failed", nil);
      }
    }];
  });
}

// call maps a verb name onto the gomobile Mobile* entry points. The facade
// takes and returns JSON bytes; this switch stays dumb on purpose because all
// typing lives in the TypeScript layer.
- (void)call:(NSString *)method
  paramsJson:(NSString *)paramsJson
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSError *error = nil;
    NSData *result = nil;
    NSString *json = @"";
    NSData *params = [paramsJson dataUsingEncoding:NSUTF8StringEncoding];

    if ([method isEqualToString:@"start"]) {
      MobileStart(paramsJson, &error);
    } else if ([method isEqualToString:@"stop"]) {
      MobileStop(&error);
    } else if ([method isEqualToString:@"getInfo"]) {
      result = MobileGetInfo(&error);
    } else if ([method isEqualToString:@"status"]) {
      result = MobileStatus(&error);
    } else if ([method isEqualToString:@"balance"]) {
      result = MobileBalance(&error);
    } else if ([method isEqualToString:@"createWallet"]) {
      result = MobileCreateWallet(params, &error);
    } else if ([method isEqualToString:@"unlockWallet"]) {
      result = MobileUnlockWallet(params, &error);
    } else if ([method isEqualToString:@"openWalletFromPasskey"]) {
      result = MobileOpenWalletFromPasskey(params, &error);
    } else if ([method isEqualToString:@"deposit"]) {
      result = MobileDeposit(params, &error);
    } else if ([method isEqualToString:@"receive"]) {
      result = MobileReceive(params, &error);
    } else if ([method isEqualToString:@"prepareSend"]) {
      result = MobilePrepareSend(params, &error);
    } else if ([method isEqualToString:@"sendPrepared"]) {
      result = MobileSendPrepared(params, &error);
    } else if ([method isEqualToString:@"list"]) {
      result = MobileList(params, &error);
    } else if ([method isEqualToString:@"exit"]) {
      result = MobileExit(params, &error);
    } else if ([method isEqualToString:@"exitStatus"]) {
      result = MobileExitStatus(params, &error);
    } else if ([method isEqualToString:@"exitSummary"]) {
      result = MobileExitSummary(params, &error);
    } else if ([method isEqualToString:@"getExitPlan"]) {
      result = MobileGetExitPlan(params, &error);
    } else if ([method isEqualToString:@"sweepWallet"]) {
      result = MobileSweepWallet(params, &error);
    } else if ([method isEqualToString:@"confirmedBalanceSat"]) {
      int64_t value = 0;
      MobileConfirmedBalanceSat(&value, &error);
      json = [NSString stringWithFormat:@"%lld",
          (long long)value];
    } else if ([method isEqualToString:@"pendingInboundSat"]) {
      int64_t value = 0;
      MobilePendingInboundSat(&value, &error);
      json = [NSString stringWithFormat:@"%lld",
          (long long)value];
    } else if ([method isEqualToString:@"walletReady"]) {
      BOOL value = NO;
      MobileWalletReady(&value, &error);
      json = value ? @"true" : @"false";
    } else if ([method isEqualToString:@"isRunning"]) {
      json = MobileIsRunning() ? @"true" : @"false";
    } else {
      reject(kWavelengthErrorCode,
             [NSString stringWithFormat:@"unknown wavelength verb: %@", method],
             nil);
      return;
    }

    if (error != nil) {
      reject(kWavelengthErrorCode, error.localizedDescription, error);
      return;
    }
    if (result != nil) {
      json = [[NSString alloc] initWithData:result encoding:NSUTF8StringEncoding];
    }
    resolve(json ?: @"");
  });
}

// startActivity opens the facade's pull subscription and pumps entries to
// device events on a background queue, because next() blocks.
- (void)startActivity:(NSString *)reqJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    // The check, the subscribe, and the store happen in one critical section
    // (mirroring the Kotlin module): separate sections would let two
    // overlapping calls both subscribe, leaking a pump that double-emits
    // every entry.
    MobileSubscription *sub = nil;
    NSError *error = nil;
    @synchronized (self) {
      if (self->_subscription != nil) {
        resolve(nil);
        return;
      }
      NSData *req = [reqJson dataUsingEncoding:NSUTF8StringEncoding];
      sub = MobileSubscribe(req, &error);
      if (error == nil && sub != nil) {
        self->_subscription = sub;
      }
    }
    if (error != nil || sub == nil) {
      reject(kWavelengthErrorCode,
             error.localizedDescription ?: @"wavelength subscribe failed",
             error);
      return;
    }

    [self pump:sub];
    resolve(nil);
  });
}

- (void)stopActivity:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    MobileSubscription *sub = nil;
    @synchronized (self) {
      sub = self->_subscription;
      // Detach before close returns so a queued start can't reuse a pump
      // that's already stopping.
      self->_subscription = nil;
    }
    NSError *error = nil;
    if (sub != nil) {
      [sub close:&error];
    }
    if (error != nil) {
      reject(kWavelengthErrorCode, error.localizedDescription, error);
      return;
    }
    resolve(nil);
  });
}

// pump drains the subscription on a background queue until it ends, emitting
// one device event per entry and a terminal end or error event.
- (void)pump:(MobileSubscription *)sub
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    while (YES) {
      NSError *error = nil;
      NSData *entry = [sub next:&error];
      if (error != nil || entry == nil) {
        // A nil entry with no error, or the exact terminal "EOF", is a clean
        // close; a substring match would misclassify failures like
        // "unexpected EOF" as clean ends.
        BOOL eof = error == nil ||
            [error.localizedDescription isEqualToString:@"EOF"];
        BOOL stopped;
        @synchronized (self) {
          stopped = self->_subscription != sub;
        }
        // An intentional stop has no terminal event. A replacement may
        // already be open by the time this old pump unblocks.
        if (stopped) {
          break;
        }
        if (eof) {
          [self sendEventWithName:kWavelengthEvent
                             body:@{ @"kind" : @"end", @"payload" : @"" }];
        } else {
          [self sendEventWithName:kWavelengthEvent
                             body:@{
                               @"kind" : @"error",
                               @"payload" : error.localizedDescription
                                   ?: @"wavelength activity stream failed"
                             }];
        }
        break;
      }
      BOOL stopped;
      @synchronized (self) {
        stopped = self->_subscription != sub;
      }
      if (stopped) {
        break;
      }
      NSString *json =
          [[NSString alloc] initWithData:entry encoding:NSUTF8StringEncoding];
      [self sendEventWithName:kWavelengthEvent
                         body:@{ @"kind" : @"entry", @"payload" : json ?: @"" }];
    }
    @synchronized (self) {
      if (self->_subscription == sub) {
        self->_subscription = nil;
      }
    }
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWavelengthSpecJSI>(params);
}

@end
