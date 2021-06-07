import {config as dotEnvConfig} from "dotenv";

dotEnvConfig();

import {HardhatUserConfig} from "hardhat/types";
import "hardhat-typechain";
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import '@nomiclabs/hardhat-etherscan';

import '@nomiclabs/hardhat-truffle5';


import {HardhatNetworkAccountsUserConfig} from "hardhat/types/config";

const INFURA_API_KEY = process.env.INFURA_API_KEY;
const MNEMONIC = process.env.MNEMONIC;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const accounts: HardhatNetworkAccountsUserConfig = {
	mnemonic: MNEMONIC ?? 'test test test test test test test test test test test junk'
};
const config: HardhatUserConfig = {
	defaultNetwork: "hardhat",
	namedAccounts: {
		deployer: 0,
		bob: 1,
		proxyAdmin: 4,
	},
	etherscan: {
		apiKey: ETHERSCAN_API_KEY,
	},
	solidity: {
		compilers: [
			{
				version: "0.6.12", settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					},
				}
			}
		],
		overrides: {
			"contracts/proxy/UpgradableProxy.sol": {
				version: '0.6.12',
				settings: {
					optimizer: {
						enabled: true,
						runs: 999999,
					},
				},
			}
		}
	},

	networks: {
		hardhat: {
			tags: process.env.DEFAULT_TAG ? process.env.DEFAULT_TAG.split(',') : ["local"],
			live: false,
			saveDeployments: false,
			chainId: 1,
			accounts,
		},
		localhost: {
			tags: ["local"],
			live: false,
			saveDeployments: false,
			url: 'http://localhost:8545',
			accounts,
			timeout: 60000,
		},
		rinkeby: {
			tags: ["local", "staging"],
			live: true,
			saveDeployments: true,
			url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
			accounts,
		},
		kovan: {
			tags: ["local", "staging"],
			live: true,
			saveDeployments: true,
			accounts,
			loggingEnabled: true,
			url: `https://kovan.infura.io/v3/${INFURA_API_KEY}`,
		},
		matic: {
			tags: ['production'],
			live: true,
			saveDeployments: true,
			accounts: [
				process.env.MNEMONICC ?? 'test'
			],
			loggingEnabled: true,
			url: `https://rpc-mainnet.maticvigil.com/`,
		},
		bsc: {
			tags: ['production'],
			live: true,
			saveDeployments: true,
			accounts: [
				process.env.MNEMONICC ?? 'test'
			],
			loggingEnabled: true,
			url: `https://bsc-dataseed.binance.org/`,
		},
		bsctestnet: {
			tags: ['local', 'staging'],
			live: true,
			saveDeployments: true,
			accounts,
			loggingEnabled: true,
			url: `https://data-seed-prebsc-1-s2.binance.org:8545`,
		},
		ganache: {
			tags: ["local"],
			live: true,
			saveDeployments: false,
			accounts,
			url: "http://127.0.0.1:8555", // Coverage launches its own ganache-cli client
		},
		coverage: {
			tags: ["local"],
			live: false,
			saveDeployments: false,
			accounts,
			url: "http://127.0.0.1:8555", // Coverage launches its own ganache-cli client
		},
	},
	typechain: {
		outDir: "typechain",
		target: "ethers-v5",
	},
	paths: {
		// sources: "./lib/proxy/contracts",
		sources: "./contracts/compositevaults",
		tests: "./test",
		cache: "./cache",
		artifacts: "./artifacts",
	},
	mocha: {
		timeout: 200000
	},
	external: {
		contracts: [{
			artifacts: "./lib/uniswap/externalArtifacts",
		},{
			artifacts: "./lib/balancer/externalArtifacts",
		}],
	},
	contractSizer: {
		alphaSort: true,
		runOnCompile: true,
		disambiguatePaths: false,
	}
};

export default config;
