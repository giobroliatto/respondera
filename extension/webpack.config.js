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
      content: './src/content.ts',
      background: './src/background.ts',
      popup: './src/popup/popup.ts',
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
          { from: 'manifest.json', to: '.' },
          { from: 'src/popup/popup.html', to: '.' },
          { from: 'src/popup/popup.css', to: '.' },
          { from: 'public/icons', to: 'icons' },
        ],
      }),
    ],
  };
};
