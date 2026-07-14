package engineering.lightning.wavelength.reactnative

import android.os.Build
import androidx.core.content.ContextCompat
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.NoCredentialException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import engineering.lightning.wavewalletdk.mobile.Mobile
import engineering.lightning.wavewalletdk.mobile.Subscription
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

// The thin JSON pipe between JS and the gomobile facade. Every facade verb runs on a
// background executor because the facade's calls block (start until the
// daemon serves, RPCs until they answer). All typing lives in TypeScript.
class WavelengthModule(reactContext: ReactApplicationContext) :
  NativeWavelengthSpec(reactContext) {

  private val executor: ExecutorService = Executors.newCachedThreadPool()

  override fun getName(): String = NAME

  override fun getDefaultDataDir(promise: Promise) {
    promise.resolve(File(reactApplicationContext.filesDir, "wavelength").absolutePath)
  }

  // passkeySupported is a cheap prerequisite probe (platform passkeys need
  // API 28 and Play services); like the web probe, true does not guarantee
  // the ceremony will yield a PRF output.
  override fun passkeySupported(promise: Promise) {
    val playServicesReady = GoogleApiAvailability.getInstance()
      .isGooglePlayServicesAvailable(reactApplicationContext) ==
      ConnectionResult.SUCCESS
    promise.resolve(Build.VERSION.SDK_INT >= 28 && playServicesReady)
  }

  // passkeyCreate runs a WebAuthn registration through Credential Manager,
  // which consumes and produces the standard WebAuthn JSON verbatim.
  override fun passkeyCreate(requestJson: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject(ERROR_CODE, "passkey ceremony requires a foreground activity")
      return
    }
    try {
      CredentialManager.create(reactApplicationContext).createCredentialAsync(
        activity,
        CreatePublicKeyCredentialRequest(requestJson),
        null,
        ContextCompat.getMainExecutor(activity),
        object :
          CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException> {
          override fun onResult(result: CreateCredentialResponse) {
            val json =
              (result as? CreatePublicKeyCredentialResponse)?.registrationResponseJson
            if (json == null) {
              promise.reject(ERROR_CODE, "credential provider returned an unexpected type")
            } else {
              promise.resolve(json)
            }
          }

          override fun onError(e: CreateCredentialException) {
            promise.reject(ERROR_CODE, passkeyErrorMessage(e), e)
          }
        },
      )
    } catch (e: Throwable) {
      // Request construction validates the JSON eagerly; reject rather than
      // crash when a caller bypasses the TypeScript ceremony with bad input.
      promise.reject(ERROR_CODE, e.message ?: "passkey ceremony failed", e)
    }
  }

  // passkeyGet runs a WebAuthn assertion through Credential Manager.
  override fun passkeyGet(requestJson: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject(ERROR_CODE, "passkey ceremony requires a foreground activity")
      return
    }
    try {
      CredentialManager.create(reactApplicationContext).getCredentialAsync(
        activity,
        GetCredentialRequest(listOf(GetPublicKeyCredentialOption(requestJson))),
        null,
        ContextCompat.getMainExecutor(activity),
        object :
          CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
          override fun onResult(result: GetCredentialResponse) {
            val json =
              (result.credential as? PublicKeyCredential)?.authenticationResponseJson
            if (json == null) {
              promise.reject(ERROR_CODE, "credential provider returned an unexpected type")
            } else {
              promise.resolve(json)
            }
          }

          override fun onError(e: GetCredentialException) {
            promise.reject(ERROR_CODE, passkeyErrorMessage(e), e)
          }
        },
      )
    } catch (e: Throwable) {
      // Request construction validates the JSON eagerly; reject rather than
      // crash when a caller bypasses the TypeScript ceremony with bad input.
      promise.reject(ERROR_CODE, e.message ?: "passkey ceremony failed", e)
    }
  }

  // passkeyErrorMessage maps the Credential Manager exception taxonomy onto
  // the ceremony's user-facing messages, matching the web ceremony's wording.
  private fun passkeyErrorMessage(e: Exception): String = when (e) {
    is CreateCredentialCancellationException -> "passkey registration was cancelled"
    is GetCredentialCancellationException -> "passkey authentication was cancelled"
    is NoCredentialException -> "no passkey is available on this device for this app"
    is CreateCredentialProviderConfigurationException,
    is GetCredentialProviderConfigurationException,
    -> "no passkey provider is configured on this device"
    else -> e.message ?: "passkey ceremony failed"
  }

  override fun call(method: String, paramsJson: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(dispatch(method, paramsJson))
      } catch (e: Throwable) {
        promise.reject(ERROR_CODE, e.message ?: "wavelength call failed", e)
      }
    }
  }

  // dispatch maps a verb name onto the generated Mobile entry points. The
  // switch stays dumb on purpose because all typing lives in TypeScript.
  private fun dispatch(method: String, paramsJson: String): String {
    val params = paramsJson.toByteArray(Charsets.UTF_8)
    return when (method) {
      "start" -> { Mobile.start(paramsJson); "" }
      "stop" -> { Mobile.stop(); "" }
      "getInfo" -> Mobile.getInfo().toString(Charsets.UTF_8)
      "status" -> Mobile.status().toString(Charsets.UTF_8)
      "balance" -> Mobile.balance().toString(Charsets.UTF_8)
      "createWallet" -> Mobile.createWallet(params).toString(Charsets.UTF_8)
      "unlockWallet" -> Mobile.unlockWallet(params).toString(Charsets.UTF_8)
      "openWalletFromPasskey" -> Mobile.openWalletFromPasskey(params).toString(Charsets.UTF_8)
      "deposit" -> Mobile.deposit(params).toString(Charsets.UTF_8)
      "receive" -> Mobile.receive(params).toString(Charsets.UTF_8)
      "prepareSend" -> Mobile.prepareSend(params).toString(Charsets.UTF_8)
      "sendPrepared" -> Mobile.sendPrepared(params).toString(Charsets.UTF_8)
      "list" -> Mobile.list(params).toString(Charsets.UTF_8)
      "exit" -> Mobile.exit(params).toString(Charsets.UTF_8)
      "exitStatus" -> Mobile.exitStatus(params).toString(Charsets.UTF_8)
      "exitSummary" -> Mobile.exitSummary(params).toString(Charsets.UTF_8)
      "getExitPlan" -> Mobile.getExitPlan(params).toString(Charsets.UTF_8)
      "sweepWallet" -> Mobile.sweepWallet(params).toString(Charsets.UTF_8)
      "confirmedBalanceSat" -> Mobile.confirmedBalanceSat().toString()
      "pendingInboundSat" -> Mobile.pendingInboundSat().toString()
      "walletReady" -> Mobile.walletReady().toString()
      "isRunning" -> Mobile.isRunning().toString()
      else -> throw IllegalArgumentException("unknown wavelength verb: $method")
    }
  }

  private var subscription: Subscription? = null

  override fun startActivity(reqJson: String, promise: Promise) {
    executor.execute {
      try {
        synchronized(this) {
          if (subscription == null) {
            val sub = Mobile.subscribe(reqJson.toByteArray(Charsets.UTF_8))
            subscription = sub
            Thread({ pump(sub) }, "wavelength-activity").apply {
              isDaemon = true
              start()
            }
          }
        }
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject(ERROR_CODE, e.message ?: "wavelength subscribe failed", e)
      }
    }
  }

  override fun stopActivity(promise: Promise) {
    executor.execute {
      try {
        val sub = synchronized(this) {
          val active = subscription
          // Detach before close returns so a queued start can't reuse a pump
          // that's already stopping.
          subscription = null
          active
        }
        sub?.close()
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject(ERROR_CODE, e.message ?: "wavelength unsubscribe failed", e)
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
          // Only the exact terminal "EOF" is a clean close; a substring match
          // would misclassify real failures like "unexpected EOF" as clean
          // ends and silently freeze the stream.
          val stopped = synchronized(this) { subscription !== sub }
          // An intentional stop has no terminal event. A replacement may
          // already be open by the time this old pump unblocks.
          if (stopped) {
            break
          }
          if (e.message == "EOF") {
            sendEvent("end", "")
          } else {
            sendEvent("error", e.message ?: "wavelength activity stream failed")
          }
          break
        }
        if (synchronized(this) { subscription !== sub }) {
          break
        }
        sendEvent("entry", entry.toString(Charsets.UTF_8))
      }
    } catch (t: Throwable) {
      // Emitting can fail while React tears down (a reload mid-stream);
      // there is nobody left to notify, but this daemon thread must never
      // crash the process.
    } finally {
      try {
        sub.close()
      } catch (ignored: Exception) {
        // The subscription may already be closed; nothing further to do.
      }
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
      .emit("wavelengthActivity", body)
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "Wavelength"
    const val ERROR_CODE = "wavelength_error"
  }
}
