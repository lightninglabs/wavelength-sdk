package engineering.lightning.walletdk.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// Registers the walletdk turbo module with the React runtime.
class WalletdkPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == WalletdkModule.NAME) WalletdkModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        WalletdkModule.NAME to ReactModuleInfo(
          WalletdkModule.NAME,
          WalletdkModule.NAME,
          false,
          false,
          false,
          true,
        ),
      )
    }
}
