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
    StrategyCurveStableFactory,
    StrategyFairLaunchKyberDmmLpFactory,
    StrategyPancakeCakeFactory,
    StrategySushiMiniV2StableSwapFactory,
      StrategyRewardsQuickLpFactory,
      StrategyLqtyStakingLpFactory,
  StrategyVenusLeverageFactory,
  StrategyPolycatLpFactory
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

        //FISH-MATIC polycat
        let stratetgy77 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await stratetgy77.initialize(
          "0x6b2d7c0cC9F75Db8dd5228F329730BbC732FeA05",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          4,
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x3a3df212b7aa91aa0402b9035b098891d276572b",
          controller.address
        );
        //paw -> matic
        await stratetgy77.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0xCdf59DE1d771E265aD8A1571532181e137258f44"]);
        //matic -> fish
        await stratetgy77.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3a3df212b7aa91aa0402b9035b098891d276572b", ["0x6b2d7c0cC9F75Db8dd5228F329730BbC732FeA05"]);


        //PAWV2-USDC polycat
        let strategy76 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy76.initialize(
          "0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          1,
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          controller.address
        );
        //paw -> usdc
        await strategy76.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF"]);


        //PAWV2-FISH polycat
        let strategy75 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy75.initialize(
          "0xC7080deB5d75d528Ba36Eb3bEc0b4C27797752fa",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          6,
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", //paw
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x3a3df212b7aa91aa0402b9035b098891d276572b",
          controller.address
        );
        //paw -> usdc
        await strategy75.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF"]);
        //paw -> fish
        await strategy75.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x3a3df212b7aa91aa0402b9035b098891d276572b", ["0xC7080deB5d75d528Ba36Eb3bEc0b4C27797752fa"]);


        //DAI-MATIC polycat
        let strategy74 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy74.initialize(
          "0x9cE65ae286e74f1268D19aB9b25f102C25DbDCb4",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          9,
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
          controller.address
        );
        //paw -> matic
        await strategy74.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0xCdf59DE1d771E265aD8A1571532181e137258f44"]);
        //matic -> dai
        await strategy74.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", ["0x9cE65ae286e74f1268D19aB9b25f102C25DbDCb4"]);


        //WETH-WMATIC polycat
        let strategy73 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy73.initialize(
          "0xC4e90AE0298E0e7BE0102Cce64089231e1E2D67C",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          11,
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          controller.address
        );
        //paw -> weth
        await strategy73.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0x578a00f09eC1c69FBeAA5235aEDaA8B0D0C25D4E"]);
        //weth -> wmatic
        await strategy73.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x7887a048a2E5995CcFC3B1F2E9c23Ab2EcA40BCF"]);


        //USDT-WBTC polycat
        let strategy72 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy72.initialize(
          "0x0509083749716B68f0fdB490a59Ca62F2cfFEbB9",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          8,
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", //usdt
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          controller.address
        );
        //paw -> usdt
        await strategy72.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ["0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF", "0x97B4f2797cC903D76F9b8ff41A94286F0B16198e"]);
        //usdt -> wbtc
        await strategy72.setFirebirdPairs("0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0x0509083749716B68f0fdB490a59Ca62F2cfFEbB9"]);


        //WETH-WBTC polycat
        let strategy71 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy71.initialize(
          "0xbbBd54c1CD649288d2e584917778eEccD8D8254d",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          14,
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          controller.address
        );
        //paw -> weth
        await strategy71.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0x578a00f09eC1c69FBeAA5235aEDaA8B0D0C25D4E"]);
        //weth -> wbtc
        await strategy71.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0x10F525CFbCe668815Da5142460af0fCfb5163C81"]);


        //DAI-USDC polycat
        let strategy70 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy70.initialize(
          "0xC8174d091c288FF78De98303c2973140Cbcf3B23",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          16,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
          controller.address
        );
        //paw -> usdc
        await strategy70.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF"]);
        //usdc -> dai
        await strategy70.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", ["0xC8174d091c288FF78De98303c2973140Cbcf3B23"]);


        //USDC-USDT polycat
        let strategy69 = await new StrategyPolycatLpFactory(deployerMainnet).deploy();
        await strategy69.initialize(
          "0x97B4f2797cC903D76F9b8ff41A94286F0B16198e",
          "0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f",
          "0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a",
          15,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          controller.address
        );
        //paw -> usdc
        await strategy69.setFirebirdPairs("0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF"]);
        //usdc -> usdt
        await strategy69.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ["0x97B4f2797cC903D76F9b8ff41A94286F0B16198e"]);

        //IRON interest rUSDT
        let strategy68 = await new StrategyVenusLeverageFactory(deployerMainnet).deploy();
        await strategy68.initialize(
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          "0xad6ad29d6b8b74b4302dd829c945ca3274035c16",
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          "0",
          "0",
          controller.address
        );
        //ice -> usdt
        await strategy68.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ["0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5", "0xc7f1B47F4ed069E9B34e6bD59792B8ABf5a66339"]);


        //IRON interest rWBTC
        let strategy67 = await new StrategyVenusLeverageFactory(deployerMainnet).deploy();
        await strategy67.initialize(
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          "0xEe1eb5fEBeF78A1eb1a23E79930D9c587F954E05",
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          "0",
          "0",
          controller.address
        );
        //ice -> btc
        await strategy67.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5", "0x10F525CFbCe668815Da5142460af0fCfb5163C81"]);


        //IRON interest rUSDC
        let strategy66 = await new StrategyVenusLeverageFactory(deployerMainnet).deploy();
        await strategy66.initialize(
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          "0xbEbAD52f3A50806b25911051BabDe6615C8e21ef",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0",
          "0",
          controller.address
        );
        //ice -> usdc
        await strategy66.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x34832D9AC4127a232C1919d840f7aaE0fcb7315B"]);


        //IRON interest rWETH
        let strategy65 = await new StrategyVenusLeverageFactory(deployerMainnet).deploy();
        await strategy65.initialize(
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          "0x186C4137136970739b472A8192D3D2AFc5543B61",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0",
          "0",
          controller.address
        );
        //ice -> eth
        await strategy65.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5"]);


        //IRON interest rMATIC
        let strategy64 = await new StrategyVenusLeverageFactory(deployerMainnet).deploy();
        await strategy64.initialize(
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          "0xCa0F37f73174a28a64552D426590d3eD601ecCa1",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "950000000000000000",
          "10000000000000000",
          controller.address
        );
        //ice -> matic
        await strategy64.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5", "0x7887a048a2E5995CcFC3B1F2E9c23Ab2EcA40BCF"]);


        //UST-USDT dfyn
        let strategy63 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy63.initialize(
          "0x39BEd7f1C412ab64443196A6fEcb2ac20C707224",
          "0xaa9654becca45b5bdfa5ac646c939c62b527d394",
          "0x1948abC5400Aa1d72223882958Da3bec643fb4E5",
          12,
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", //usdt
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", //usdt
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          "0x692597b009d13c4049a947cab2239b7d6517875f",
          controller.address
        );
        //dino -> usdt
        await strategy63.setFirebirdPairs("0xAa9654BECca45B5BDFA5ac646c939C62b527D394", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ["0x3324af8417844e70b81555A6D1568d78f4D4Bf1f", "0x2cF7252e74036d1Da831d11089D326296e64a728"]);
        //usdt -> ust
        await strategy63.setFirebirdPairs("0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0x692597b009d13c4049a947cab2239b7d6517875f", ["0x39BEd7f1C412ab64443196A6fEcb2ac20C707224"]);


        //DINO-WETH quick
        let strategy62 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy62.initialize(
          "0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11",
          "0xaa9654becca45b5bdfa5ac646c939c62b527d394",
          "0x1948abC5400Aa1d72223882958Da3bec643fb4E5",
          11,
          "0xaa9654becca45b5bdfa5ac646c939c62b527d394", //dino
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0xaa9654becca45b5bdfa5ac646c939c62b527d394",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          controller.address
        );
        //dino -> eth
        await strategy62.setFirebirdPairs("0xaa9654becca45b5bdfa5ac646c939c62b527d394", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11"]);


        //xUSD-matic sushi
        let strategy61 = await new StrategyLqtyStakingLpFactory(deployerMainnet).deploy();
        await strategy61.initialize(
          "0xc2FEC6e52A2e4622eb91E5ae4f23F0eA73c47Aa2",
          ["0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975"],
          "0xa00493d324cD342834eB657228c59d63b5EB2E89",
          "0x3a3e7650f8b9f667da98f236010fbf44ee4b2975", //xUSD
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x3a3e7650f8b9f667da98f236010fbf44ee4b2975",
          controller.address
        );
        //matic -> xUSD
        await strategy61.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975", ["0xc2FEC6e52A2e4622eb91E5ae4f23F0eA73c47Aa2"]);
        //xUSD -> matic
        await strategy61.setFirebirdPairs("0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0xc2FEC6e52A2e4622eb91E5ae4f23F0eA73c47Aa2"]);


        //xUSD-USDC dfyn
        let strategy60 = await new StrategyLqtyStakingLpFactory(deployerMainnet).deploy();
        await strategy60.initialize(
          "0x527e43ca8f600f120b1eaEe2aFc80E3Cb375e191",
          ["0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975"],
          "0x1e49892c0d0D4455bbbA633EeDaDd6d26224369e",
          "0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975", //xUSD
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x3a3e7650f8b9f667da98f236010fbf44ee4b2975",
          controller.address
        );
        //matic -> xUSD
        await strategy60.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975", ["0xc2FEC6e52A2e4622eb91E5ae4f23F0eA73c47Aa2"]);
        //xUSD -> usdc
        await strategy60.setFirebirdPairs("0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x527e43ca8f600f120b1eaEe2aFc80E3Cb375e191"]);


        //xUSD-DFYN dfyn
        let strategy59 = await new StrategyRewardsQuickLpFactory(deployerMainnet).deploy();
        await strategy59.initialize(
          "0xB023e038Ee031C4550b0EE322E85de78621077F9",
          ["0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975"],
          "0xc6Cface612849C1D378Fbfe8Bdf49D01bbf569Bb",
          "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", //dfyn
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97",
          "0x3a3e7650f8b9f667da98f236010fbf44ee4b2975",
          controller.address
        );
        //dfyn -> usdc
        await strategy59.setFirebirdPairs("0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x4c38938E21cB9796932B0B0Cc3f8a088f07b49B0"]);
        //xUSD -> dfyn
        await strategy59.setFirebirdPairs("0x3a3e7650f8b9f667da98f236010fbf44ee4b2975", "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", ["0xB023e038Ee031C4550b0EE322E85de78621077F9"]);
        //dfyn -> xusd
        await strategy59.setFirebirdPairs("0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", "0x3a3e7650f8b9f667da98f236010fbf44ee4b2975", ["0xB023e038Ee031C4550b0EE322E85de78621077F9"]);
        //matic -> dfyn
        await strategy59.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", ["0xCe2cB67b11ec0399E39AF20433927424f9033233", "0x4c38938E21cB9796932B0B0Cc3f8a088f07b49B0"]);

        //meeb-matic firebird
        let strategy58 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy58.initialize(
          "0x0364e0C75e9fbFC7Ad34253c043f48518775D0e6",
          "0x64afdf9e28946419e325d801fb3053d8b8ffdc23",
          "0x91be2c9f175ac3f8e58b04bbd739df3d325ebfa8",
          3,
          "0x64afdf9e28946419e325d801fb3053d8b8ffdc23",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "50",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          "0x64afdf9e28946419e325d801fb3053d8b8ffdc23",
          controller.address
        );
        //meeb -> matic
        await strategy58.setFirebirdPairs("0x64afdf9e28946419e325d801fb3053d8b8ffdc23", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x0364e0C75e9fbFC7Ad34253c043f48518775D0e6"]);


        //sMatic-sdo firebird
        let strategy47 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy47.initialize(
          "0xa14B83FbB32C5207ab84370a28d01E4720B9C348",
          "0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54",
          "0x69E7Bbe85db0364397378364458952bEcB886920",
          5,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          50,
          "0xc1ac5c0b73ba01a31c93884c28a31e9985842c38",
          "0x66c59dded4ef01a3412a8b019b6e41d4a8c49a35",
          controller.address
        );
        //sds -> usdc
        await strategy47.setFirebirdPairs("0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x46A30dFece0E0fc0977eefd15bd0595fdDe15a10"]);
        //usdc -> sMatic
        await strategy47.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xc1ac5c0b73ba01a31c93884c28a31e9985842c38", ["0xCe2cB67b11ec0399E39AF20433927424f9033233", "0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18"]);
        //usdc -> sdo
        await strategy47.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x66c59dded4ef01a3412a8b019b6e41d4a8c49a35", ["0x6649F12E210862e0045B3dFe7E6eA1F8F0565049"]);


        //sMatic-matic firebird
        let strategy46 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy46.initialize(
          "0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18",
          "0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54",
          "0x69E7Bbe85db0364397378364458952bEcB886920",
          4,
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          50,
          "0xc1ac5c0b73ba01a31c93884c28a31e9985842c38",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          controller.address
        );
        //sds -> matic
        await strategy46.setFirebirdPairs("0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x46A30dFece0E0fc0977eefd15bd0595fdDe15a10", "0xCe2cB67b11ec0399E39AF20433927424f9033233"]);
        //matic -> sMatic
        await strategy46.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0xc1ac5c0b73ba01a31c93884c28a31e9985842c38", ["0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18"]);


        //ICE-HOPE firebird
        let strategy45 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy45.initialize(
          "0xEe26d8b6548Ac0368100FB3C74231B88e67A282F",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          36,
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660", //hope
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660", //hope
          "50",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef",
          controller.address
        );
        //hope -> ice
        await strategy45.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef", ["0xEe26d8b6548Ac0368100FB3C74231B88e67A282F"]);


        //ICE-DFYN dfyn
        let strategy44 = await new StrategyQuickLpFactory(deployerMainnet).deploy();
        await strategy44.initialize(
          "0x9bb608dc0F9308B9beCA2F7c80865454d02E74cA",
          "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97",
          "0xD854E7339840F7D1E12B54FD75235eBc0bB6BfAC",
          "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", //dfyn
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97",
          "0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef",
          controller.address
        );
        //dfyn -> usdc
        await strategy44.setFirebirdPairs("0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x4c38938E21cB9796932B0B0Cc3f8a088f07b49B0"]);
        //dfyn -> ice
        await strategy44.setFirebirdPairs("0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97", "0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef", ["0x9bb608dc0F9308B9beCA2F7c80865454d02E74cA"]);


        //ICE-ETH firebird
        let strategy43 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy43.initialize(
          "0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5",
          ["0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef"],
          "0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD",
          1,
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", //ice
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          controller.address
        );
        //ice -> eth
        await strategy43.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5"]);


        //ICE-USDC dfyn
        let strategy42 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy42.initialize(
          "0x34832D9AC4127a232C1919d840f7aaE0fcb7315B",
          ["0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef"],
          "0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD",
          2,
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", //ice
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef",
          controller.address
        );
        //ice -> usdc
        await strategy42.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x34832D9AC4127a232C1919d840f7aaE0fcb7315B"]);


        //Iron3USD
        let strategy41 = await new StrategySushiMiniV2StableSwapFactory(deployerMainnet).deploy();
        await strategy41.initialize(
          "0xb4d09ff3dA7f9e9A2BA029cb0A81A989fd7B8f17",
          ["0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef"],
          "0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD",
          0,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x837503e8A8753ae17fB8C8151B8e6f586defCb57",
          0,
          controller.address
        );
        //ice -> usdc
        await strategy41.setFirebirdPairs("0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x34832D9AC4127a232C1919d840f7aaE0fcb7315B"]);


        //pWINGS
        let strategy25 = await new StrategyPancakeCakeFactory(deployerMainnet).deploy();
        await strategy25.initialize(
          "0x845E76A8691423fbc4ECb8Dd77556Cb61c09eE25",
          "0x845E76A8691423fbc4ECb8Dd77556Cb61c09eE25",
          "0x4e22399070aD5aD7f7BEb7d3A7b543e8EcBf1d85",
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", //usdt
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", //usdt
          controller.address
        );
        //pWINGS -> USDT
        await strategy25.setFirebirdPairs("0x845e76a8691423fbc4ecb8dd77556cb61c09ee25", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ["0xA39a7640790907D4865a74c1F9715715DBd00431"]);

        //knc-eth dmm lp
        let strategy19 = await new StrategyFairLaunchKyberDmmLpFactory(deployerMainnet).deploy();
        await strategy19.initialize(
          "0xd8B9E9444fCBF26BEA4BAdd6142dD6a962BCA86A",
          "0x3add3034fcf921f20c74c6149fb44921709595b1",
          3,
          "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", //knc
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c",
          controller.address
        );
        await strategy19.setApproveKyberRouterForToken("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", maxUint256);
        //knc -> eth
        await strategy19.setKyberPaths("0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xd8B9E9444fCBF26BEA4BAdd6142dD6a962BCA86A"], ["0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"]);


        //usdc-weth dmm lp
        let strategy18 = await new StrategyFairLaunchKyberDmmLpFactory(deployerMainnet).deploy();
        await strategy18.initialize(
          "0x95D708e9eE04b0136b98579141624d19c89B9d68",
          "0x3add3034fcf921f20c74c6149fb44921709595b1",
          2,
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //eth
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          controller.address
        );
        await strategy18.setApproveKyberRouterForToken("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", maxUint256);
        await strategy18.setApproveKyberRouterForToken("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", maxUint256);
        //knc -> eth
        await strategy18.setKyberPaths("0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xd8B9E9444fCBF26BEA4BAdd6142dD6a962BCA86A"], ["0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"]);
        //eth -> usdc
        await strategy18.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x39D736D2b254eE30796f43Ec665143010b558F82"]);


        //usdc-dai dmm lp
        let strategy17 = await new StrategyFairLaunchKyberDmmLpFactory(deployerMainnet).deploy();
        await strategy17.initialize(
          "0x7018C0bd73255C8966d0B26634E0BC0c7595D255",
          "0x3add3034fcf921f20c74c6149fb44921709595b1",
          1,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
          controller.address
        );
        await strategy17.setApproveKyberRouterForToken("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", maxUint256);
        await strategy17.setApproveKyberRouterForToken("0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", maxUint256);
        //knc -> usdc
        await strategy17.setKyberPaths("0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xd8B9E9444fCBF26BEA4BAdd6142dD6a962BCA86A", "0x95D708e9eE04b0136b98579141624d19c89B9d68"], ["0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"]);
        //usdc -> dai
        await strategy17.setKyberPaths("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", ["0x7018C0bd73255C8966d0B26634E0BC0c7595D255"], ["0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"]);


        //usdc-usdt dmm lp
        let strategy16 = await new StrategyFairLaunchKyberDmmLpFactory(deployerMainnet).deploy();
        await strategy16.initialize(
          "0x3904aC366D348636694CB6720aa1540e76441b1B",
          "0x3add3034fcf921f20c74c6149fb44921709595b1",
          0,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          controller.address
        );
        await strategy16.setApproveKyberRouterForToken("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", maxUint256);
        await strategy16.setApproveKyberRouterForToken("0xc2132d05d31c914a87c6611c10748aeb04b58e8f", maxUint256);
        //knc -> usdc
        await strategy16.setKyberPaths("0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xd8B9E9444fCBF26BEA4BAdd6142dD6a962BCA86A", "0x95D708e9eE04b0136b98579141624d19c89B9d68"], ["0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"]);
        //usdc -> usdt
        await strategy16.setKyberPaths("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", ["0x3904aC366D348636694CB6720aa1540e76441b1B"], ["0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"]);


        //matic-knc dmm lp
        let strategy15 = await new StrategyFairLaunchKyberDmmLpFactory(deployerMainnet).deploy();
        await strategy15.initialize(
          "0x37e6449B0e99BeFD2A708eA048d970F4FF4dC65d",
          "0x829c27fd3013b944cbe76e92c3d6c45767c0c789",
          1,
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          controller.address
        );
        //knc -> matic
        await strategy15.setKyberPaths("0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x37e6449B0e99BeFD2A708eA048d970F4FF4dC65d"], ["0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"]);
        //matic -> knc
        await strategy15.setKyberPaths("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", ["0x37e6449B0e99BeFD2A708eA048d970F4FF4dC65d"], ["0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c"]);


        //matic-dai dmm lp
        let strategy14 = await new StrategyFairLaunchKyberDmmLpFactory(deployerMainnet).deploy();
        await strategy14.initialize(
          "0x45963db838a070cF7BE8e7046fD63e23d376c665",
          "0x829c27fd3013b944cbE76E92c3D6c45767c0C789",
          0,
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          controller.address
        );
        await strategy14.setApproveKyberRouterForToken("0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", maxUint256);
        //knc -> matic
        await strategy14.setKyberPaths("0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x37e6449B0e99BeFD2A708eA048d970F4FF4dC65d"], ["0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"]);
        //matic -> dai
        await strategy14.setKyberPaths("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", ["0x45963db838a070cF7BE8e7046fD63e23d376c665"], ["0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"]);


        //IRON3pool
        let strategy13 = await new StrategyHopeChefStableSwapLpFactory(deployerMainnet).deploy();
        await strategy13.initialize(
          "0xC45c1087a6eF7A956af96B0fEED5a7c270f5C901",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          8,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x563E49a74fd6AB193751f6C616ce7Cf900D678E5",
          "0x01C9475dBD36e46d1961572C8DE24b74616Bae9e",
          1,
          controller.address
        );
        //hope -> usdc
        await strategy13.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa", "0x39D736D2b254eE30796f43Ec665143010b558F82"]);


        //3fbird
        let strategy12 = await new StrategyHopeChefStableSwapFactory(deployerMainnet).deploy();
        await strategy12.initialize(
          "0x4a592De6899fF00fBC2c99d7af260B5E7F88D1B4",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          7,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x01C9475dBD36e46d1961572C8DE24b74616Bae9e",
          1,
          controller.address
        );
        //hope -> usdc
        await strategy12.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa", "0x39D736D2b254eE30796f43Ec665143010b558F82"]);


        //wbtc-weth firebird
        let strategy11 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy11.initialize(
          "0x10F525CFbCe668815Da5142460af0fCfb5163C81",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          2,
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          "50",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
          controller.address
        );
        //hope -> weth
        await strategy11.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa"]);
        //weth -> wbtc
        await strategy11.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0x10F525CFbCe668815Da5142460af0fCfb5163C81"]);


        //weth-usdc firebird
        let strategy10 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy10.initialize(
          "0x39D736D2b254eE30796f43Ec665143010b558F82",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          3,
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          "50",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          controller.address
        );
        //hope -> weth
        await strategy10.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa"]);
        //weth -> usdc
        await strategy10.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x39D736D2b254eE30796f43Ec665143010b558F82"]);


        //matic-weth firebird
        let strategy9 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy9.initialize(
          "0x7887a048a2E5995CcFC3B1F2E9c23Ab2EcA40BCF",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          5,
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          "50",
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
          controller.address
        );
        //hope -> weth
        await strategy9.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa"]);
        //weth -> matic
        await strategy9.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x7887a048a2E5995CcFC3B1F2E9c23Ab2EcA40BCF"]);


        //matic-usdc firebird
        let strategy8 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy8.initialize(
          "0xCe2cB67b11ec0399E39AF20433927424f9033233",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          4,
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          "50",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //matic
          controller.address
        );
        //hope -> matic
        await strategy8.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x5E9cd0861F927ADEccfEB2C0124879b277Dd66aC"]);
        //matic -> usdc
        await strategy8.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xCe2cB67b11ec0399E39AF20433927424f9033233"]);


        //titan-usdc firebird
        let strategy7 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy7.initialize(
          "0x3AAcc8107FDfd2230262E48893B4BF21D588c87E",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          6,
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", //usdc
          "50",
          "0xaaa5b9e6c589642f98a1cda99b9d024b8407285a",
          "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
          controller.address
        );
        //hope -> usdc
        await strategy7.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa", "0x39D736D2b254eE30796f43Ec665143010b558F82"]);
        //usdc -> titan
        await strategy7.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", ["0x3AAcc8107FDfd2230262E48893B4BF21D588c87E"]);


        //weth-hope firebird
        let strategy6 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy6.initialize(
          "0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          1,
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "50",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660", //hope
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", //weth
          controller.address
        );
        //hope -> weth
        await strategy6.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa"]);


        //matic-hope firebird
        let strategy5 = await new StrategyPairWeightLpFactory(deployerMainnet).deploy();
        await strategy5.initialize(
          "0x5E9cd0861F927ADEccfEB2C0124879b277Dd66aC",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4",
          13,
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660",
          "50",
          "0xd78c475133731cd54dadcb430f7aae4f03c1e660", //hope
          "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", //wmatic
          controller.address
        );
        //hope -> matic
        await strategy5.setFirebirdPairs("0xd78c475133731cd54dadcb430f7aae4f03c1e660", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ["0x5E9cd0861F927ADEccfEB2C0124879b277Dd66aC"]);


        //iron-usdc quick
        let strategy4 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy4.initialize(
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
        await strategy4.setFirebirdPairs("0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x3AAcc8107FDfd2230262E48893B4BF21D588c87E"]);
        //usdc -> iron
        await strategy4.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xd86b5923f3ad7b585ed81b448170ae026c65ae9a", ["0x85de135ff062df790a5f20b79120f17d3da63b2d"]);


        //iron-usdc sushi
        let strategy3 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy3.initialize(
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
        await strategy3.setFirebirdPairs("0xaaa5b9e6c589642f98a1cda99b9d024b8407285a", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0x3AAcc8107FDfd2230262E48893B4BF21D588c87E"]);
        //usdc -> iron
        await strategy3.setFirebirdPairs("0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "0xd86b5923f3ad7b585ed81b448170ae026c65ae9a", ["0x2bbe0f728f4d5821f84eee0432d2a4be7c0cb7fc"]);


        //am3crv
        let strategy2 = await new StrategyCurveStableFactory(deployerMainnet).deploy();
        await strategy2.initialize(
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
        await strategy2.setFirebirdPairs("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", ["0xcd353f79d9fade311fc3119b841e1f456b54e858"]);


        //btc-eth quick lp
        let strategy1 = await new StrategyQuickLpFactory(deployerMainnet).deploy();
        await strategy1.initialize(
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
        await strategy1.setFirebirdPairs("0x831753DD7087CaC61aB5644b308642cc1c33Dc13", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0x1bd06b96dd42ada85fdd0795f3b4a79db914add5"]);
        //eth -> btc
        await strategy1.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0xdc9232e2df177d7a12fdff6ecbab114e2231198d"]);


        //btc-eth sushi lp
        let strategy0 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy0.initialize(
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
        await strategy0.setFirebirdPairs("0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xb5846453b67d0b4b4ce655930cf6e4129f4416d7"]);
        // matic -> eth
        await strategy0.setFirebirdPairs("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", ["0xc4e595acdd7d12fec385e5da5d43160e8a0bac0e"]);
        // eth -> btc
        await strategy0.setFirebirdPairs("0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", ["0xe62ec2e799305e0d367b0cc3ee2cda135bf89816"]);
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
