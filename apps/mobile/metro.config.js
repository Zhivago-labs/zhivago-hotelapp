const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Permite que o Metro veja arquivos fora de apps/mobile (ex: packages/shared)
config.watchFolders = [workspaceRoot];

// Resolve node_modules tanto do próprio app quanto do root do workspace (hoisted)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
