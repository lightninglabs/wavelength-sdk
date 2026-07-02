package engineering.lightning.walletdk.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import engineering.lightning.walletdk.mobile.Mobile
import engineering.lightning.walletdk.mobile.Subscription
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
    val params = paramsJson.toByteArray(Charsets.UTF_8)
    val result: ByteArray? = when (method) {
      "start" -> { Mobile.start(paramsJson); null }
      "stop" -> { Mobile.stop(); null }
      "getInfo" -> Mobile.getInfo()
      "status" -> Mobile.status()
      "balance" -> Mobile.balance()
      "createWallet" -> Mobile.createWallet(params)
      "unlockWallet" -> Mobile.unlockWallet(params)
      "openWalletFromPasskey" -> Mobile.openWalletFromPasskey(params)
      "deposit" -> Mobile.deposit(params)
      "receive" -> Mobile.receive(params)
      "prepareSend" -> Mobile.prepareSend(params)
      "sendPrepared" -> Mobile.sendPrepared(params)
      "list" -> Mobile.list(params)
      "exit" -> Mobile.exit(params)
      "exitStatus" -> Mobile.exitStatus(params)
      "getExitPlan" -> Mobile.getExitPlan(params)
      "sweepWallet" -> Mobile.sweepWallet(params)
      else -> throw IllegalArgumentException("unknown walletdk verb: $method")
    }
    return result?.toString(Charsets.UTF_8) ?: ""
  }

  private var subscription: Subscription? = null

  // closing marks an intentional close so the pump reports a clean end
  // instead of an error when next() unblocks with a cancellation.
  @Volatile private var closing = false

  override fun startActivity(reqJson: String, promise: Promise) {
    executor.execute {
      try {
        synchronized(this) {
          if (subscription == null) {
            closing = false
            val sub = Mobile.subscribe(reqJson.toByteArray(Charsets.UTF_8))
            subscription = sub
            Thread({ pump(sub) }, "walletdk-activity").apply {
              isDaemon = true
              start()
            }
          }
        }
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject(ERROR_CODE, e.message ?: "walletdk subscribe failed", e)
      }
    }
  }

  override fun stopActivity(promise: Promise) {
    executor.execute {
      try {
        val sub = synchronized(this) {
          closing = true
          subscription
        }
        sub?.close()
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject(ERROR_CODE, e.message ?: "walletdk unsubscribe failed", e)
      }
    }
  }

  // pump drains the facade's pull subscription, forwarding each entry as a
  // device event until the stream ends. Runs on its own daemon thread because
  // next() blocks.
  private fun pump(sub: Subscription) {
    try {
      while (true) {
        val entry = try {
          sub.next()
        } catch (e: Exception) {
          val eof = e.message?.contains("EOF", ignoreCase = true) == true
          if (closing || eof) {
            sendEvent("end", "")
          } else {
            sendEvent("error", e.message ?: "walletdk activity stream failed")
          }
          break
        }
        sendEvent("entry", entry.toString(Charsets.UTF_8))
      }
    } finally {
      synchronized(this) {
        if (subscription === sub) {
          subscription = null
        }
      }
    }
  }

  private fun sendEvent(kind: String, payload: String) {
    val body = Arguments.createMap().apply {
      putString("kind", kind)
      putString("payload", payload)
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("walletdkActivity", body)
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "Walletdk"
    const val ERROR_CODE = "walletdk_error"
  }
}
