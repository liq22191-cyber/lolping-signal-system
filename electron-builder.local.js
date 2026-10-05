// 本地打包专用配置 —— 解决国内从 GitHub 下载 Electron 二进制包卡死的问题
//
// 背景：electron-builder 默认要联网下载 Electron 的完整二进制包（约 151 MB），
//       下载源是 GitHub Releases，在国内网络下完全连不通（实测 0 字节/秒）。
//
// 方案：直接指定本地已经解压好的 Electron（node_modules/electron/dist），
//       完全跳过下载环节，打包全程离线。
//
// 用法：npx electron-builder --win --publish never --config electron-builder.local.js

const path = require('path');
const pkg = require('./package.json');

module.exports = {
  // 继承 package.json 里作者写的全部打包配置，一个字都不改
  ...pkg.build,

  // 唯一的新增：告诉 electron-builder 去哪儿找 Electron，别联网下
  electronDist: path.join(__dirname, 'node_modules', 'electron', 'dist'),
};
