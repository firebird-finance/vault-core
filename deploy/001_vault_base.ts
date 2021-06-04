import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {DeploymentsExtension} from "hardhat-deploy/dist/types";
import {ADDRESS_ZERO, expandDecimals, getLatestBlock, getLatestBlockNumber, isNotDeployed, maxUint256, toWei} from "../test/shared/utilities";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";

async function createToken(deployments: DeploymentsExtension, deployer: string, name: string, decimal: number) {
    const {deploy} = deployments;
    if (await isNotDeployed(deployments, name)) {
        await deploy(name, {
            contract: "TToken",
            from: deployer,
            args: [name, name, decimal],
            skipIfAlreadyDeployed: true,
            log: true
        });
    }
    return getToken(deployments, deployer, name);
}

export async function batchApprove(from: string, deployments: DeploymentsExtension, tokens: string[], spender: string) {
    const {execute} = deployments;
    for (const token of tokens) {
        await execute(token, {from: from, log: true}, "approve", spender, maxUint256);
    }
}

async function getToken(deployments: DeploymentsExtension, fromAddress: string, name: string) {
    const {execute, read, get} = deployments;
    let token = await get(name);
    const decimal = await read(name, "decimals");
    return {
        address: token.address,
        token,
        minTo: async (receiveAddress: string, amount: any) => {
            return await execute(
                name,
                {
                    from: fromAddress,
                    log: true
                },
                "mintTo",
                receiveAddress,
                expandDecimals(amount, decimal)
            );
        },
        balanceOf: async (address: string) => {
            return await read(name, "balanceOf", address);
        },
        transfer: async (toAddress: string, amount: any) => {
            return await read(name, "transfer", toAddress, amount);
        },
        approve: async (spender: string, amount: any = maxUint256) => {
            return await execute(name, {from: fromAddress, log: true}, "approve", spender, amount);
        }
    };
}

async function createTokenAndMint(deployments: DeploymentsExtension, deployer: string, name: string, decimal: number) {
    const token = await createToken(deployments, deployer, name, decimal);
    if ((await token.balanceOf(deployer)).eq(BigNumber.from(0))) {
        await token.minTo(deployer, 800000000000000);
    }
    return token;
}

export async function deployUniswap(deployments: DeploymentsExtension, deployer: string, wethAddress: string, name: string) {
    const {deploy, execute, read} = deployments;
    let factoryName = name + "Factory";
    const factory = await deploy(factoryName, {
        contract: "UniswapV2Factory",
        from: deployer,
        args: [deployer],
        skipIfAlreadyDeployed: true,
        log: true
    });
    let routerName = name + "Router";
    const router = await deploy(routerName, {
        contract: "UniswapV2Router02",
        from: deployer,
        args: [factory.address, wethAddress],
        skipIfAlreadyDeployed: true,
        log: true
    });
    return {
        factoryName,
        routerName,
        factory,
        router,
        creatPair: async (tokenA: string, tokenB: string) => {
            await execute(factoryName, {from: deployer, log: true}, "createPair", tokenA, tokenB);
            return await read(factoryName, {from: deployer}, "getPair", tokenA, tokenB);
        },
        getPair: async (tokenA: string, tokenB: string) => {
            return await read(factoryName, {from: deployer}, "getPair", tokenA, tokenB);
        },
        addLiquidity: async (tokenA: string, tokenB: string, amountADesired: any, amountBDesired: any, to: string) => {
            return await execute(
                routerName,
                {
                    from: deployer,
                    log: true
                },
                "addLiquidity",
                tokenA,
                tokenB,
                amountADesired,
                amountBDesired,
                0,
                0,
                to,
                Math.round(new Date().getTime() / 1000 + 1000)
            );
        }
    };
}

export async function deployBalancerFactory(deployments: DeploymentsExtension, deployer: string, name: string) {
    const {deploy} = deployments;
    let bFactoryName = name + "BFactory";
    const bFactory = await deploy(bFactoryName, {
        contract: "BFactory",
        from: deployer,
        args: [],
        skipIfAlreadyDeployed: true,
        log: true
    });
    return {
        bFactoryName,
        bFactory,
        address: bFactory.address,
        newPool: async (bindTokens: {address: string; balance: any; rate: number}[]) => {
            return null;
        }
    };
}

export async function deployBalancerPool(deployments: DeploymentsExtension, deployer: string, name: string) {
    const {deploy, execute, read, log} = deployments;
    const bPool = await deploy(name, {
        contract: "BPool",
        from: deployer,
        args: [],
        skipIfAlreadyDeployed: true,
        log: true
    });
    return {
        name,
        bPool,
        address: bPool.address,
        finalize: async (bindTokens: {address: string; balance: any; rate: number}[]) => {
            for (const {address, balance, rate} of bindTokens) {
                await execute(name, {from: deployer, log: true}, "bind", address, balance, toWei(rate));
            }
            await execute(name, {from: deployer, log: true}, "finalize");
            return bPool;
        }
    };
}

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, get, read, execute, getOrNull, log} = deployments;
    const {deployer} = await getNamedAccounts();

    const BANK_NAME = "VaultBank";
    const VMASTER_NAME = "VaultMaster";

    const vmaster = await deploy(VMASTER_NAME, {
        contract: "VaultMaster",
        from: deployer,
        args: [],
        log: true
    });

    const bankLite = await deploy("VaultBankLite", {
        contract: "VaultBankLite",
        from: deployer,
        args: [],
        log: true
    });
    if (bankLite.newlyDeployed) {
        await execute("VaultBankLite", {from: deployer, log: true}, "initialize", vmaster.address);
    }
};

export default func;
func.tags = ["vault_base"];
func.dependencies = [];
