import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {BigNumber} from "ethers";

const proxyAdmin = "0x6eB5BBE1CE4b156Bdd6211E5E69CD637377a6C1A";
const vaultImpl = "0xEfE0c4Aa0092BFddBc6fF24a37f8A57192E8cCe2";
const controllerImp = "0xE77F5AAFB0823b0BC07ce03be639604e337775C2";
const numVault = 6;

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, execute} = deployments;
    const {deployer} = await getNamedAccounts();

    console.log("----------deployer: ", deployer);
    let timestamp;
    let gasPrice = BigNumber.from("8000000000");
    for (let i = 0; i < numVault; i++) {
        timestamp = Date.now();
        const vaultProxy = await deploy(`VaultProxy${timestamp}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [vaultImpl],
            log: false,
            gasPrice
        });

        const controllerProxy = await deploy(`ControllerProxy${timestamp}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [controllerImp],
            log: false,
            gasPrice
        });

        await execute(
            `VaultProxy${timestamp}`,
            {
                from: deployer,
                log: false,
                gasPrice
            },
            "transferProxyOwnership",
            proxyAdmin
        );
        await execute(`ControllerProxy${timestamp}`, {from: deployer, log: false, gasPrice}, "transferProxyOwnership", proxyAdmin);

        console.log("vault: ", vaultProxy.address);
        console.log("controller: ", controllerProxy.address);

        console.log("--------");
    }
};

export default func;
func.tags = ["vault_proxy"];
