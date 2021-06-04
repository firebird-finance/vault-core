import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {DeploymentsExtension} from "hardhat-deploy/dist/types";
import {ADDRESS_ZERO, expandDecimals, getLatestBlock, getLatestBlockNumber, isNotDeployed, maxUint256, toWei} from "../test/shared/utilities";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import base = Mocha.reporters.base;

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, get, read, execute, getOrNull, log} = deployments;
    const {deployer} = await getNamedAccounts();

    const VMASTER_NAME = "VaultMaster";

    const baseToken = "0xD66caF886f02ac76bBFa05Da5216673288d7fb5B";
    const vmaster = await get(VMASTER_NAME);
    const vbankLite = await get("VaultBankLite");

    await (async function setupVault() {
        const VAULT_NAME = "VaultBUSDWBNB";
        const CONTROLLER_NAME = "VaultControllerBUSDWBNB";
        const STRATEGY_NAME = "StrategyPairWeightLp";

        const vault = await deploy(VAULT_NAME, {
            contract: "VaultBUSDWBNB",
            from: deployer,
            args: [],
            skipIfAlreadyDeployed: true,
            log: true
        });

        if (vault.newlyDeployed) {
            await execute(VAULT_NAME, {from: deployer}, "initialize", baseToken, vmaster.address, "Vault:BUSDWBNB", "vaultBUSDWBNB");
            await execute(VMASTER_NAME, {from: deployer, log: true}, "setBank", vault.address, vbankLite.address);
        }

        const controller = await deploy(CONTROLLER_NAME, {
            contract: "VaultController",
            from: deployer,
            args: [vault.address],
            skipIfAlreadyDeployed: true,
            log: true
        });

        //pair lp wbnb-busd 98/2
        const strategy = await deploy(STRATEGY_NAME, {
            contract: "StrategyPairWeightLp",
            from: deployer,
            args: [],
            skipIfAlreadyDeployed: true,
            log: true
        });
        if (strategy.newlyDeployed) {
            await execute(
                STRATEGY_NAME,
                {from: deployer},
                "initialize",
                "0xD66caF886f02ac76bBFa05Da5216673288d7fb5B", //pair WBNB-BUSD LP
                "0x05aA371d5B9E1d666724F3045339Fa8Df64D808a", //farming token CAKE
                "0x3eA22aA5F182DfAC2bF7aD5780C2BB1042f97789", //Reward pool
                1, // pool id
                "0xd960a46b7c4aaacd471f33cdcfadd6d3803bba2e", //target compound BUSD
                "0xd960a46b7c4aaacd471f33cdcfadd6d3803bba2e", //target profit BUSD
                80,
                "0x05aa371d5b9e1d666724f3045339fa8df64d808a", //token 0: WBNB
                "0xd960a46b7c4aaacd471f33cdcfadd6d3803bba2e", //token 1: BUSD
                controller.address
            );
        }

        await execute(VMASTER_NAME, {from: deployer, log: true}, "addVault", vault.address);
        await execute(VMASTER_NAME, {from: deployer, log: true}, "addController", controller.address);
        await execute(VMASTER_NAME, {from: deployer, log: true}, "addStrategy", strategy.address);

        await execute(VAULT_NAME, {from: deployer, log: true}, "setController", controller.address);

        await execute(CONTROLLER_NAME, {from: deployer, log: true}, "approveStrategy", strategy.address);
        await execute(CONTROLLER_NAME, {from: deployer, log: true}, "setStrategyInfo", 0, strategy.address, maxUint256, 100);
        await execute(CONTROLLER_NAME, {from: deployer, log: true}, "setStrategyLength", 1);

        await execute(STRATEGY_NAME, {from: deployer, log: true}, "setFirebirdRouter", "0x1bea22fe0ac32ba91a03a5cf4471ffef656dbbf4");
        await execute(STRATEGY_NAME, {from: deployer, log: true}, "setFirebirdPairs", "0xd960a46b7c4aaacd471f33cdcfadd6d3803bba2e", "0x05aa371d5b9e1d666724f3045339fa8df64d808a", [
            "0xD66caF886f02ac76bBFa05Da5216673288d7fb5B"
        ]);
        await execute(STRATEGY_NAME, {from: deployer, log: true}, "setFirebirdPairs", "0x05aa371d5b9e1d666724f3045339fa8df64d808a", "0xd960a46b7c4aaacd471f33cdcfadd6d3803bba2e", [
            "0xD66caF886f02ac76bBFa05Da5216673288d7fb5B"
        ]);
    })();
};

export default func;
func.tags = ["vault_lp"];
func.dependencies = ["vault_base"];
