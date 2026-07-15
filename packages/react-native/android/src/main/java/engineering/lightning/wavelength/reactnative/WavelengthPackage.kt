package engineering.lightning.wavelength.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// Registers the wavelength turbo module with the React runtime.
class WavelengthPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == WavelengthModule.NAME) WavelengthModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        WavelengthModule.NAME to ReactModuleInfo(
          WavelengthModule.NAME,
          WavelengthModule.NAME,
          false,
          false,
          false,
          true,
        ),
      )
    }
}
