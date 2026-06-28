const path    = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.js',

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'chat-widget.bundle.js',
    // Plain IIFE — no UMD wrapper that would overwrite window.KnowBridgeChat.
    // index.js sets window.KnowBridgeChat itself as a side-effect.
    iife: true,
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: '> 0.25%, not dead' }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
            plugins: ['@babel/plugin-transform-runtime'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  resolve: {
    extensions: ['.js', '.jsx'],
  },

  plugins: [
    // Polyfill process.env for all modules in the bundle
    new webpack.DefinePlugin({
      'process.env.NODE_ENV':           JSON.stringify('production'),
      'process.env.REACT_APP_API_URL':  JSON.stringify(''),
      'process.env':                    JSON.stringify({}),
    }),
  ],

  mode: 'production',
  devtool: 'source-map',
};
