// Metro is the tool that bundles the phone app's code. By default it only
// looks inside mobile/. This lets it also read the repository's shared types
// and rules in ../src/shared, the same files the website uses (CLAUDE.md,
// "Shared types and validation"). Import them as "@shared/...".
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../src/shared")];

module.exports = config;
