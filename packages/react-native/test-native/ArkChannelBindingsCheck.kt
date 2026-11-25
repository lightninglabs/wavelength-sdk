package engineering.lightning.wavelength.reactnative

import engineering.lightning.wavewalletdk.mobile.Mobile

object Paired {
  val rejected = Exception("rpc error: no liquidity")
  @JvmStatic fun promoteVTXO(req: ByteArray) = req
  @JvmStatic fun payOnActiveChannel(req: ByteArray): ByteArray =
    if (req.isEmpty()) throw rejected else "pay:".encodeToByteArray() + req
  @JvmStatic fun receiveOnActiveChannel(req: ByteArray) = "receive:".encodeToByteArray() + req
}

object WrongABI {
  @JvmStatic fun promoteVTXO(req: ByteArray) = req
  @JvmStatic fun payOnActiveChannel(req: ByteArray) = req
  @JvmStatic fun receiveOnActiveChannel(req: ByteArray) = req.size
}

fun main() {
  // The released class can be inspected without initializing the Android JNI.
  for (facade in listOf(Mobile::class.java, WrongABI::class.java)) {
    val old = ArkChannelBindings(facade)
    check(!old.supported)
    check(runCatching { old.call("promoteVTXO", byteArrayOf()) }.exceptionOrNull() is MissingArkChannels)
  }
  val paired = ArkChannelBindings(Paired::class.java)
  check(paired.supported)
  val json = "{\"memo\":\"caf\u00e9\"}"
  val req = json.encodeToByteArray()
  check(paired.call("promoteVTXO", req) == json)
  check(paired.call("payOnActiveChannel", req) == "pay:$json")
  check(paired.call("receiveOnActiveChannel", req) == "receive:$json")
  check(runCatching { paired.call("payOnActiveChannel", byteArrayOf()) }.exceptionOrNull() === Paired.rejected)
  check(runCatching { paired.call("promoteVTXO", byteArrayOf()) }.isFailure)
  check(runCatching { paired.call("promoteVTXO", byteArrayOf(0xff.toByte())) }.isFailure)
}
