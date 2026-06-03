const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isDev = argv.mode !== 'production';
  const BACKEND_URL = isDev ? 'http://localhost:3333' : 'https://api.respondera.com.br';

  return {
    mode: isDev ? 'development' : 'production',
    devtool: isDev ? 'inline-source-map' : false,

    entry: {
      content:    './src/content.ts',
      background: './src/background.ts',
      popup:      './src/popup/popup.ts',
      panel:      './src/panel/panel.ts',
    },

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },

    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },

    resolve: {
      extensions: ['.ts', '.js'],
    },

    plugins: [
      new webpack.DefinePlugin({
        BACKEND_URL: JSON.stringify(BACKEND_URL),
      }),
      new CopyPlugin({
        patterns: [
          {
            from: 'manifest.json',
            to: '.',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              const apiHost = isDev ? 'http://localhost:3333/*' : 'https://api.respondera.com.br/*';
              manifest.host_permissions = [
                'https://business.google.com/*',
                'https://www.google.com/business/*',
                apiHost,
              ];
              return JSON.stringify(manifest, null, 2);
            },
          },
          { from: 'src/popup/popup.html',       to: '.' },
          { from: 'src/popup/popup.css',        to: '.' },
          { from: 'src/panel/panel.html',       to: '.' },
          { from: 'src/panel/panel.css',        to: '.' },
          {
            from: 'public/icons',
            to: 'icons',
            globOptions: {
              ignore: ['**/*.svg'],
            },
          },
        ],
      }),
    ],
  };
};
