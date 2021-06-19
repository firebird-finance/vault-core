import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {BigNumber} from "ethers";

const proxyAdmin = "0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c";
const vaultImpl = "0x20B22B8013Fb28e1652b0428f669Ee162f4bd234";
const controllerImp = "0x088A7406a521ef5E70dfDa7e49edB51f972295fE";
const numVault = 6;

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
            log: false,
            gasPrice: "2"
        });

        const controllerProxy = await deploy(`ControllerProxy${timestamp}`, {
            contract: "UpgradableProxy",
            skipIfAlreadyDeployed: false,
            from: deployer,
            args: [controllerImp],
            log: false,
            gasPrice: "2"
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
