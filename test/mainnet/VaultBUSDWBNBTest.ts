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
    StrategySushiLpFactory
} from "../../typechain";

import {SignerWithAddress} from "hardhat-deploy-ethers/dist/src/signer-with-address";

const verbose = process.env.VERBOSE;

describe("StrategyBTCWBNB", function() {
    let deployer: SignerWithAddress;
    let signers: SignerWithAddress[];
    const bobAddress = "0x1b96b92314c44b159149f7e0303511fb2fc4774f";
    let bob: SignerWithAddress;
    const deployerMainnetAddress = "0x7Be4D5A99c903C437EC77A20CB6d0688cBB73c7f";
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

        await vault.connect(deployerMainnet).initialize(baseToken.address, vaultMaster.address, "Vault:PancakeBTCBNB", "vaultBTCBNB");
        await controller.connect(deployerMainnet).initialize(vault.address, "VaultController:PancakeBTCBNB");
        await strategy.connect(deployerMainnet).initialize(baseToken.address, cakeAddress, farmingPoolAddress, 4, busd.address, busd.address, 98, btc.address, busd.address, controller.address);

        await vaultMaster.connect(deployerMainnet).addVault(vault.address);
        await vaultMaster.connect(deployerMainnet).addController(controller.address);
        await vaultMaster.connect(deployerMainnet).addStrategy(strategy.address);

        await vault.connect(deployerMainnet).setController(controller.address);

        await controller.connect(deployerMainnet).approveStrategy(strategy.address);
        await controller.connect(deployerMainnet).setStrategyInfo(0, strategy.address, maxUint256, 100);
        await controller.connect(deployerMainnet).setStrategyLength(1);
        await controller.connect(deployerMainnet).setWithdrawalFee(100);

        await strategy.connect(deployerMainnet).setFirebirdPairs(busd.address, btc.address, ["0xf98313f818c53E40Bd758C5276EF4B434463Bec4"]);
        await strategy.connect(deployerMainnet).setFirebirdPairs(cakeAddress, busd.address, ["0xC99E3abe7729a3869d5cAd631bcbB90e3d389AA2"]);

        //bnb-busd
        let strategy82 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy82.connect(deployerMainnet).initialize(
            "0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16",
            "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
            "0x73feaa1eE314F8c655E354234017bE2193C9E24E",
            252,
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", //bnb
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
            "0xe9e7cea3dedca5984780bafc599bd69add087d56",
            controller.address
        );
        //cake -> bnb
        await strategy82
            .connect(deployerMainnet)
            .setFirebirdPairs("0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", ["0x0eD7e52944161450477ee417DE9Cd3a859b14fD0"]);
        // bnb -> busd
        await strategy82
            .connect(deployerMainnet)
            .setFirebirdPairs("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0xe9e7cea3dedca5984780bafc599bd69add087d56", ["0x522361C3aa0d81D1726Fa7d40aA14505d0e097C9"]);
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
