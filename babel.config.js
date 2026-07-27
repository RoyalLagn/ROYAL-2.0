module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      ['module-resolver', {
        root: ['./'],
        alias: {
          '@': './',
          'components': './components',
          'app': './app',
          'lib': './lib',
          'assets': './assets'
        },
        extensions: [
          '.ios.ts',
          '.android.ts',
          '.ts',
          '.ios.tsx',
          '.android.tsx',
          '.tsx',
          '.jsx',
          '.js',
          '.json',
          '.web.tsx',
          '.web.ts',
          '.web.jsx',
          '.web.js'
        ]
      }]
    ]
  };
};
