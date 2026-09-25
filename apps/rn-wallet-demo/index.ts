import { registerRootComponent } from 'expo';

// Keep the smoke entry point independent of fonts, passkeys and wallet UI.
// Expo inlines this flag into the release bundle; Metro is not needed in CI.
const App = process.env.EXPO_PUBLIC_NATIVE_SMOKE === '1'
  ? require('./smoke/App').default
  : require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
