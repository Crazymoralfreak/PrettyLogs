const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const dist = path.resolve(__dirname, "dist");

const lensExternals = {
  "@k8slens/extensions": "var global.LensExtensions",
  mobx: "var global.Mobx",
};

const rendererExternals = {
  ...lensExternals,
  react: "var global.React",
  "react-dom": "var global.ReactDOM",
  "mobx-react": "var global.MobxReact",
};

const baseConfig = {
  mode: "production",
  devtool: false,
  optimization: { minimize: true },
  performance: { hints: false },
  resolve: { extensions: [".ts", ".tsx", ".js", ".jsx"] },
  module: {
    rules: [
      {
        // ESM packages (react-virtuoso) import "react/jsx-runtime" without a file extension
        test: /\.m?js$/,
        resolve: { fullySpecified: false },
      },
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: { configFile: path.resolve(__dirname, "tsconfig.json") },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
};

/** Lens main process: window manager for the pop-out viewer. */
const main = {
  ...baseConfig,
  name: "main",
  target: "electron-main",
  entry: { main: "./src/main.ts" },
  externals: lensExternals,
  node: { __dirname: false, __filename: false },
  output: { path: dist, filename: "main.js", libraryTarget: "commonjs2" },
};

/** Lens cluster frame: pages, menus, preferences, log sessions. */
const renderer = {
  ...baseConfig,
  name: "renderer",
  target: "electron-renderer",
  entry: { renderer: "./src/renderer.tsx" },
  externals: rendererExternals,
  output: { path: dist, filename: "renderer.js", libraryTarget: "commonjs2" },
};

/** Stand-alone BrowserWindow with its own copy of React. */
const popout = {
  ...baseConfig,
  name: "popout",
  target: "web",
  entry: { popout: "./src/popout/index.tsx" },
  output: { path: dist, filename: "popout.js" },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: path.resolve(__dirname, "src/popout/popout.html"), to: "popout.html" }],
    }),
  ],
};

/** Sandboxed preload script: the only bridge between the pop-out and the main process. */
const preload = {
  ...baseConfig,
  name: "preload",
  target: "electron-preload",
  entry: { preload: "./src/popout/preload.ts" },
  output: { path: dist, filename: "preload.js" },
};

module.exports = [main, renderer, popout, preload];
