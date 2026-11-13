const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.disableHierarchicalLookup = true;

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@saicommons/drawer': path.resolve(__dirname, '../../packages/drawer'),
};

config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, '../../node_modules'),
  path.resolve(__dirname, '../../packages/drawer'),
];

module.exports = config;