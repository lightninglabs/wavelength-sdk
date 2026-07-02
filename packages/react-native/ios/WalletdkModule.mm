#import "WalletdkModule.h"

#import <Walletdk/Walletdk.h>

// The single device event name; the body is { kind, payload }.
static NSString *const kWalletdkEvent = @"walletdkActivity";
static NSString *const kWalletdkErrorCode = @"walletdk_error";

@implementation WalletdkModule {
  MobileSubscription *_subscription;
  BOOL _closing;
}

RCT_EXPORT_MODULE(Walletdk)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kWalletdkEvent ];
}

- (void)getDefaultDataDir:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  NSURL *appSupport = [[NSFileManager.defaultManager
      URLsForDirectory:NSApplicationSupportDirectory
             inDomains:NSUserDomainMask] firstObject];
  resolve([appSupport URLByAppendingPathComponent:@"walletdk"].path);
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
    } else if ([method isEqualToString:@"getExitPlan"]) {
      result = MobileGetExitPlan(params, &error);
    } else if ([method isEqualToString:@"sweepWallet"]) {
      result = MobileSweepWallet(params, &error);
    } else {
      reject(kWalletdkErrorCode,
             [NSString stringWithFormat:@"unknown walletdk verb: %@", method],
             nil);
      return;
    }

    if (error != nil) {
      reject(kWalletdkErrorCode, error.localizedDescription, error);
      return;
    }
    NSString *json = result
        ? [[NSString alloc] initWithData:result encoding:NSUTF8StringEncoding]
        : @"";
    resolve(json);
  });
}

// startActivity opens the facade's pull subscription and pumps entries to
// device events on a background queue, because next() blocks.
- (void)startActivity:(NSString *)reqJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    MobileSubscription *sub = nil;
    @synchronized (self) {
      if (self->_subscription != nil) {
        sub = self->_subscription;
      }
    }
    if (sub != nil) {
      resolve(nil);
      return;
    }

    NSError *error = nil;
    NSData *req = [reqJson dataUsingEncoding:NSUTF8StringEncoding];
    sub = MobileSubscribe(req, &error);
    if (error != nil || sub == nil) {
      reject(kWalletdkErrorCode,
             error.localizedDescription ?: @"walletdk subscribe failed",
             error);
      return;
    }

    @synchronized (self) {
      self->_subscription = sub;
      self->_closing = NO;
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
      self->_closing = YES;
      sub = self->_subscription;
    }
    NSError *error = nil;
    if (sub != nil) {
      [sub close:&error];
    }
    if (error != nil) {
      reject(kWalletdkErrorCode, error.localizedDescription, error);
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
        BOOL eof = [error.localizedDescription.lowercaseString
            containsString:@"eof"];
        BOOL closing;
        @synchronized (self) {
          closing = self->_closing;
        }
        if (closing || eof) {
          [self sendEventWithName:kWalletdkEvent
                             body:@{ @"kind" : @"end", @"payload" : @"" }];
        } else {
          [self sendEventWithName:kWalletdkEvent
                             body:@{
                               @"kind" : @"error",
                               @"payload" : error.localizedDescription
                                   ?: @"walletdk activity stream failed"
                             }];
        }
        break;
      }
      NSString *json =
          [[NSString alloc] initWithData:entry encoding:NSUTF8StringEncoding];
      [self sendEventWithName:kWalletdkEvent
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
  return std::make_shared<facebook::react::NativeWalletdkSpecJSI>(params);
}

@end
