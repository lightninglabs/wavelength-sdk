import { View } from 'react-native';
import QRCodeSVG from 'react-native-qrcode-svg';

// QRCode renders a real, scannable QR on a white plate. The plate stays white
// in both themes: scanners want dark modules on a light ground.
export function QRCode({ value, size = 176 }: { value: string; size?: number }) {
  return (
    <View style={{ backgroundColor: '#ffffff', padding: 16 }}>
      <QRCodeSVG
        value={value}
        size={size}
        color="#0a0a0b"
        backgroundColor="#ffffff"
      />
    </View>
  );
}
