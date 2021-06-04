import "@nomiclabs/hardhat-vyper";
import config from "./hardhat.config";

config.vyper = {
	// version: "0.1.0b17"
	version: "0.2.7"
};
config.paths = {
	sources: "./lib/usdn",
	tests: "./test",
	cache: "./cache",
	artifacts: "./artifacts",
};
export default config;
