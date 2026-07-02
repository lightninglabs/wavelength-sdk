package engineering.lightning.walletdk.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import engineering.lightning.walletdk.mobile.Mobile
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

// The thin JSON pipe between JS and the gomobile facade. Every verb runs on a
// background executor because the facade's calls block (start until the
// daemon serves, RPCs until they answer). All typing lives in TypeScript.
class WalletdkModule(reactContext: ReactApplicationContext) :
  NativeWalletdkSpec(reactContext) {

  private val executor: ExecutorService = Executors.newCachedThreadPool()

  override fun getName(): String = NAME

  override fun getDefaultDataDir(promise: Promise) {
    promise.resolve(File(reactApplicationContext.filesDir, "walletdk").absolutePath)
  }

  override fun call(method: String, paramsJson: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(dispatch(method, paramsJson))
      } catch (e: Exception) {
        promise.reject(ERROR_CODE, e.message ?: "walletdk call failed", e)
      }
    }
  }

  // dispatch maps a verb name onto the generated Mobile entry points. The
  // remaining verbs land with the full transport implementation.
  private fun dispatch(method: String, paramsJson: String): String {
    val result: ByteArray? = when (method) {
      "start" -> { Mobile.start(paramsJson); null }
      "stop" -> { Mobile.stop(); null }
      "getInfo" -> Mobile.getInfo()
      else -> throw IllegalArgumentException("unknown walletdk verb: $method")
    }
    return result?.toString(Charsets.UTF_8) ?: ""
  }

  override fun startActivity(reqJson: String, promise: Promise) {
    promise.reject(ERROR_CODE, "startActivity lands in a later task")
  }

  override fun stopActivity(promise: Promise) {
    promise.resolve(null)
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "Walletdk"
    const val ERROR_CODE = "walletdk_error"
  }
}
