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
    StrategyCurveStableFactory,
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

        //iron-usdc quick
        let strategy4 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy4.connect(deployerMainnet).initialize(
          "0x2bbe0f728f4d5821f84eee0432d2a4be7c0cb7fc",
          "0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", //titan
          "0x65430393358e55A658BcdE6FF69AB28cF1CbB77a",
          2,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0xd86b5923f3ad7b585ed81b448170ae026c65ae9a",
          controller.address
        );
        //titan -> usdc
        await strategy4.connect(deployerMainnet).setFirebirdPairs("0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x3AAcc8107FDfd2230262E48893B4BF21D588c87E"]);
        //usdc -> iron
        await strategy4.connect(deployerMainnet).setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xd86b5923f3ad7b585ed81b448170ae026c65ae9a", ["0x85de135ff062df790a5f20b79120f17d3da63b2d"]);


        //iron-usdc sushi
        let strategy3 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy3.connect(deployerMainnet).initialize(
          "0x85de135ff062df790a5f20b79120f17d3da63b2d",
          "0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", //titan
          "0x65430393358e55A658BcdE6FF69AB28cF1CbB77a",
          1,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0xd86b5923f3ad7b585ed81b448170ae026c65ae9a",
          controller.address
        );
        //titan -> usdc
        await strategy3.connect(deployerMainnet).setFirebirdPairs("0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x3AAcc8107FDfd2230262E48893B4BF21D588c87E"]);
        //usdc -> iron
        await strategy3.connect(deployerMainnet).setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xd86b5923f3ad7b585ed81b448170ae026c65ae9a", ["0x2bbe0f728f4d5821f84eee0432d2a4be7c0cb7fc"]);


        //am3crv
        let strategy2 = await new StrategyCurveStableFactory(deployerMainnet).deploy();
        await strategy2.connect(deployerMainnet).initialize(
          "0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171",
          "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
          "0xe381C25de995d62b453aF8B931aAc84fcCaa7A62",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          1,
          "0x445FE580eF8d70FF569aB36e80c647af338db351",
          controller.address
        );
        //matic -> usdc
        await strategy2.connect(deployerMainnet).setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xcd353f79d9fade311fc3119b841e1f456b54e858"]);


        //btc-eth quick lp
        let strategy1 = await new StrategyQuickLpFactory(deployerMainnet).deploy();
        await strategy1.connect(deployerMainnet).initialize(
          "0xdc9232e2df177d7a12fdff6ecbab114e2231198d",
          "0x831753DD7087CaC61aB5644b308642cc1c33Dc13",
          "0x070D182EB7E9C3972664C959CE58C5fC6219A7ad",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          controller.address
        );
        //quick -> eth
        await strategy1.connect(deployerMainnet).setFirebirdPairs("0x831753DD7087CaC61aB5644b308642cc1c33Dc13", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0x1bd06b96dd42ada85fdd0795f3b4a79db914add5"]);
        //eth -> btc
        await strategy1.connect(deployerMainnet).setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0xdc9232e2df177d7a12fdff6ecbab114e2231198d"]);


        //btc-eth sushi lp
        let strategy0 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy0.connect(deployerMainnet).initialize(
            "0xe62ec2e799305e0d367b0cc3ee2cda135bf89816",
            ["0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"], //sushi, matic
            "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F",
            3,
            "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
            "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
            "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", //btc
            "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
            controller.address
        );
        //sushi -> eth
        await strategy0.connect(deployerMainnet).setFirebirdPairs("0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xb5846453b67d0b4b4ce655930cf6e4129f4416d7"]);
        // matic -> eth
        await strategy0.connect(deployerMainnet).setFirebirdPairs("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xc4e595acdd7d12fec385e5da5d43160e8a0bac0e"]);
        // eth -> btc
        await strategy0.connect(deployerMainnet).setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0xe62ec2e799305e0d367b0cc3ee2cda135bf89816"]);
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
