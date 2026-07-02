#import "WalletdkModule.h"

#import <Walletdk/Walletdk.h>

// The single device event name; the body is { kind, payload }.
static NSString *const kWalletdkEvent = @"walletdkActivity";
static NSString *const kWalletdkErrorCode = @"walletdk_error";

@implementation WalletdkModule

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
// typing lives in the TypeScript layer. Task 10 completes the verb set.
- (void)call:(NSString *)method
  paramsJson:(NSString *)paramsJson
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSError *error = nil;
    NSData *result = nil;

    if ([method isEqualToString:@"start"]) {
      MobileStart(paramsJson, &error);
    } else if ([method isEqualToString:@"stop"]) {
      MobileStop(&error);
    } else if ([method isEqualToString:@"getInfo"]) {
      result = MobileGetInfo(&error);
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

- (void)startActivity:(NSString *)reqJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  reject(kWalletdkErrorCode, @"startActivity lands in a later task", nil);
}

- (void)stopActivity:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  resolve(nil);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWalletdkSpecJSI>(params);
}

@end
