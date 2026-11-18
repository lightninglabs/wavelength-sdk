# Public gomobile methods looked up by name on channel-capable artifacts.
-keepclassmembers class engineering.lightning.wavewalletdk.mobile.Mobile {
    public static byte[] promoteVTXO(byte[]);
    public static byte[] payOnActiveChannel(byte[]);
    public static byte[] receiveOnActiveChannel(byte[]);
}
