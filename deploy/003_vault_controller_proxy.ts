import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {BigNumber} from "ethers";

const proxyAdmin = "0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c";
const vaultImpl = "0x20B22B8013Fb28e1652b0428f669Ee162f4bd234";
const controllerImp = "0xFAcd3C980D45F6Cf2Df08f3d96E003A8ed2f3442";
const numVault = 1;

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, execute} = deployments;
    const {deployer} = await getNamedAccounts();

    console.log("----------deployer: ", deployer);
    for (let i = 0; i < numVault; i++) {
        const vaultProxy = await deploy(`VaultProxy${i}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [vaultImpl],
            log: true
        });

        const controllerProxy = await deploy(`ControllerProxy${i}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [controllerImp],
            log: true
        });

        await execute(`VaultProxy${i}`, {from: deployer, log: true}, "transferProxyOwnership", proxyAdmin);
        await execute(`ControllerProxy${i}`, {from: deployer, log: true}, "transferProxyOwnership", proxyAdmin);

        console.log("vault: ", vaultProxy.address);
        console.log("controller: ", controllerProxy.address);

        console.log("--------");
    }
};

export default func;
func.tags = ["vault_proxy"];
