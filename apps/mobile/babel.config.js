/**
 * NativeWind needs its own JSX import source and babel plugin. Everything else
 * comes from babel-preset-expo, so this file only adds what NativeWind requires.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
