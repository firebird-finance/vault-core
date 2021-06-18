import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {BigNumber} from "ethers";

const proxyAdmin = "0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c";
const vaultImpl = "0xf929389D1B5A22026910593d0E082fe4877FD163";
const controllerImp = "0xe4B5FB684D65Ca0f8d61E5c5D83B8a824aEda0bB";
const numVault = 3;

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, execute} = deployments;
    const {deployer} = await getNamedAccounts();

    console.log("----------deployer: ", deployer);
    let timestamp;
    for (let i = 0; i < numVault; i++) {
        timestamp = Date.now();
        const vaultProxy = await deploy(`VaultProxy${timestamp}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [vaultImpl],
            log: false
        });

        const controllerProxy = await deploy(`ControllerProxy${timestamp}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [controllerImp],
            log: false
        });

        await execute(`VaultProxy${timestamp}`, {from: deployer, log: false}, "transferProxyOwnership", proxyAdmin);
        await execute(`ControllerProxy${timestamp}`, {from: deployer, log: false}, "transferProxyOwnership", proxyAdmin);

        console.log("vault: ", vaultProxy.address);
        console.log("controller: ", controllerProxy.address);

        console.log("--------");
    }
};

export default func;
func.tags = ["vault_proxy"];
