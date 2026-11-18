package engineering.lightning.wavelength.reactnative

import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Modifier

// v0.2.1 does not export these methods. Resolve only the public gomobile
// byte[] ABI, and require the whole feature before starting a channel wallet.
internal class ArkChannelBindings(facade: Class<*>) {
  private val calls = listOf(
    "promoteVTXO", "payOnActiveChannel", "receiveOnActiveChannel",
  ).associateWith { name ->
    try {
      facade.getMethod(name, ByteArray::class.java).takeIf {
        Modifier.isStatic(it.modifiers) && it.returnType == ByteArray::class.java
      }
    } catch (_: NoSuchMethodException) {
      null
    }
  }

  val supported = calls.values.all { it != null }

  fun call(name: String, params: ByteArray): String {
    val method = calls.getValue(name)
    if (!supported || method == null) throw MissingArkChannels()
    val bytes = try {
      method.invoke(null, params) as ByteArray?
    } catch (e: InvocationTargetException) {
      // Reflection wraps the actual daemon exception, often with no message.
      throw e.targetException
    }
    check(bytes != null && bytes.isNotEmpty()) { "$name returned no JSON" }
    return bytes.decodeToString(throwOnInvalidSequence = true)
  }
}

internal class MissingArkChannels : Exception("Native bindings do not support Ark channels")
