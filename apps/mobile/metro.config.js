const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// `global.css` already carries the web font variables — NativeWind adds the
// Tailwind layers to it.
module.exports = withNativeWind(config, { input: './src/global.css' });
