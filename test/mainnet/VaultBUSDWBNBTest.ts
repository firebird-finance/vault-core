import {ethers, deployments} from "hardhat";
import {expect} from "../chai-setup";

import {
    ADDRESS_ZERO,
    collapseDecimals,
    expandDecimals,
    forkBlockNumber,
    fromWei,
    getLatestBlockNumber,
    getLatestBlockTimeStamp,
    maxUint256,
    mineBlocks,
    toWei,
    unlockForkAddresses
} from "../shared/utilities";
import {
    MockErc20Factory,
    MockErc20,
    VaultFactory,
    VaultControllerFactory,
    VaultBank,
    VaultBankFactory,
    VaultMaster,
    VaultMasterFactory,
    Vault,
    VaultController,
    StrategyPairWeightLpFactory,
    StrategyPairWeightLp,
    StrategySushiLpFactory,
    StrategySushiMiniV2LpFactory,
    StrategyQuickLpFactory,
    StrategyHopeChefStableSwapFactory,
    StrategyHopeChefStableSwapLpFactory,
    StrategyCurveStableFactory
} from "../../typechain";

import {SignerWithAddress} from "hardhat-deploy-ethers/dist/src/signer-with-address";

const verbose = process.env.VERBOSE;

describe("StrategyBTCWBNB", function() {
    let deployer: SignerWithAddress;
    let signers: SignerWithAddress[];
    const bobAddress = "0x1b96b92314c44b159149f7e0303511fb2fc4774f";
    let bob: SignerWithAddress;
    const deployerMainnetAddress = "0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c";
    let deployerMainnet: SignerWithAddress;

    let baseToken: MockErc20;
    let wethToken: MockErc20;
    let busd: MockErc20;
    let bnb: MockErc20;
    let btc: MockErc20;

    const cakeAddress = "0x4f0ed527e8A95ecAA132Af214dFd41F30b361600";
    const farmingPoolAddress = "0xd56339F80586c08B7a4E3a68678d16D37237Bd96";
    const baseTokenAddress = "0xf98313f818c53E40Bd758C5276EF4B434463Bec4";
    const wethAddress = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
    const token0Address = "0x0610c2d9f6ebc40078cf081e2d1c4252dd50ad15";
    const token1Address = "0xe9e7cea3dedca5984780bafc599bd69add087d56";
    let vaultMaster: VaultMaster;

    let strategy: StrategyPairWeightLp;
    let vault: Vault;
    let controller: VaultController;

    before(async function() {
        await forkBlockNumber(ethers, 5188050);
        await unlockForkAddresses(ethers, [deployerMainnetAddress, bobAddress]);

        deployerMainnet = await ethers.getSigner(deployerMainnetAddress);
        bob = await ethers.getSigner(bobAddress);

        signers = await ethers.getSigners();
        deployer = signers[0];

        baseToken = await MockErc20Factory.connect(baseTokenAddress, deployer);
        wethToken = await MockErc20Factory.connect(wethAddress, deployer);
        btc = await MockErc20Factory.connect(token0Address, deployer);
        busd = await MockErc20Factory.connect(token1Address, deployer);
        bnb = await MockErc20Factory.connect(wethAddress, deployer);

        vaultMaster = await new VaultMasterFactory(deployerMainnet).deploy();

        vault = await new VaultFactory().deploy();

        controller = await new VaultControllerFactory(deployerMainnet).deploy();
        strategy = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();

        await vault.initialize(baseToken.address, vaultMaster.address, "Vault:PancakeBTCBNB", "vaultBTCBNB");
        await controller.initialize(vault.address, "VaultController:PancakeBTCBNB");
        await strategy.initialize(baseToken.address, cakeAddress, farmingPoolAddress, 4, busd.address, busd.address, 98, btc.address, busd.address, controller.address);

        await vaultMaster.addVault(vault.address);
        await vaultMaster.addController(controller.address);
        await vaultMaster.addStrategy(strategy.address);

        await vault.setController(controller.address);

        await controller.approveStrategy(strategy.address);
        await controller.setStrategyInfo(0, strategy.address, maxUint256, 100);
        await controller.setStrategyLength(1);
        await controller.setWithdrawalFee(100);

        await strategy.setFirebirdPairs(busd.address, btc.address, ["0xf98313f818c53E40Bd758C5276EF4B434463Bec4"]);
        await strategy.setFirebirdPairs(cakeAddress, busd.address, ["0xC99E3abe7729a3869d5cAd631bcbB90e3d389AA2"]);

        //dot-bnb
        let strategy3 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy3.initialize(
          "0xe7fbB8bd95322618e925affd84D7eC0E32DC0e57",
          "0x965f527d9159dce6288a2219db51fc6eef120dd1",
          "0xDbc1A13490deeF9c3C12b44FE77b503c1B061739",
          14,
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
          "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
          controller.address
        );
        //bsw -> bnb
        await strategy3.setFirebirdPairs("0x965f527d9159dce6288a2219db51fc6eef120dd1", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", ["0x46492B26639Df0cda9b2769429845cb991591E0A"]);
        //bnb -> dot
        await strategy3.setFirebirdPairs("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402", ["0xe7fbB8bd95322618e925affd84D7eC0E32DC0e57"]);


        //bnb-busd
        let strategy2 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy2.initialize(
          "0xaCAac9311b0096E04Dfe96b6D87dec867d3883Dc",
          "0x965f527d9159dce6288a2219db51fc6eef120dd1",
          "0xDbc1A13490deeF9c3C12b44FE77b503c1B061739",
          3,
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
          "0xe9e7cea3dedca5984780bafc599bd69add087d56",
          controller.address
        );
        //bsw -> bnb
        await strategy2.setFirebirdPairs("0x965f527d9159dce6288a2219db51fc6eef120dd1", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", ["0x46492B26639Df0cda9b2769429845cb991591E0A"]);
        //bnb -> busd
        await strategy2.setFirebirdPairs("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0xe9e7cea3dedca5984780bafc599bd69add087d56", ["0xB73B0C0B2dB8808C88f704046A6c7926AbEE45aC"]);


        //bnb-usdt
        let strategy1 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy1.initialize(
          "0x8840C6252e2e86e545deFb6da98B2a0E26d8C1BA",
          "0x965f527d9159dce6288a2219db51fc6eef120dd1",
          "0xDbc1A13490deeF9c3C12b44FE77b503c1B061739",
          2,
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
          "0x55d398326f99059fF775485246999027B3197955",
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
          controller.address
        );
        //bsw -> bnb
        await strategy1.setFirebirdPairs("0x965f527d9159dce6288a2219db51fc6eef120dd1", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", ["0x46492B26639Df0cda9b2769429845cb991591E0A"]);
        //bnb -> usdt
        await strategy1.setFirebirdPairs("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0x55d398326f99059fF775485246999027B3197955", ["0x8840C6252e2e86e545deFb6da98B2a0E26d8C1BA"]);


        //eth-bnb biswap lp
        let strategy0 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy0.initialize(
            "0x5bf6941f029424674bb93A43b79fc46bF4A67c21",
            "0x965f527d9159dce6288a2219db51fc6eef120dd1",
            "0xDbc1A13490deeF9c3C12b44FE77b503c1B061739",
            12,
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
            "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
            controller.address
        );
        //bsw -> bnb
        await strategy0.setFirebirdPairs("0x965f527d9159dce6288a2219db51fc6eef120dd1", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", ["0x46492B26639Df0cda9b2769429845cb991591E0A"]);
        //bnb -> eth
        await strategy0.setFirebirdPairs("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0x2170ed0880ac9a755fd29b2688956bd959f933f8", ["0x92588091D0F19Aa5dB3Ed39C2Bb13E2279De5EC1"]);
    });

    async function setNextBlockTimestamp(timestamp: number) {
        const block = await ethers.provider.send("eth_getBlockByNumber", ["latest", false]);
        const currentTs = block.timestamp;
        const diff = timestamp - currentTs;
        await ethers.provider.send("evm_increaseTime", [diff]);
    }

    async function moveForwardTimeStamp(timestamp: number) {
        await setNextBlockTimestamp((await getLatestBlockTimeStamp(ethers)) + timestamp);
        await ethers.provider.send("evm_mine", []);
    }
});
