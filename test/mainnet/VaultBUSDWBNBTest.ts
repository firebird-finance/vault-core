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
  StrategyPolycatLpFactory,
  StrategyBalancerLpFactory
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


        //XFTM-FTM spirit
        let strategy8 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy8.initialize(
          "0x128aff18EfF64dA69412ea8d262DC4ef8bb3102d",
          ["0xaa621D2002b5a6275EF62d7a065A865167914801"],
          "0x7aeE1FF33E1b7F6D874D488fb2533a79419ca240",
          1,
          "0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F", //xftm
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //ftm
          "0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F",
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
          controller.address
        );
        //fsm -> xftm
        await strategy8.setFirebirdPairs("0xaa621D2002b5a6275EF62d7a065A865167914801", "0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F", ["0xbEa8E843c0fD428f79a166EaE2671E3a8Cc39A0a"]);
        //xftm -> ftm
        await strategy8.setFirebirdPairs("0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", ["0x128aff18EfF64dA69412ea8d262DC4ef8bb3102d"]);


        //FSM-XFTM spirit
        let strategy7 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy7.initialize(
          "0xbEa8E843c0fD428f79a166EaE2671E3a8Cc39A0a",
          ["0xaa621D2002b5a6275EF62d7a065A865167914801"],
          "0x7aeE1FF33E1b7F6D874D488fb2533a79419ca240",
          2,
          "0xaa621D2002b5a6275EF62d7a065A865167914801", //fsm
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //ftm
          "0xaa621D2002b5a6275EF62d7a065A865167914801", //fsm
          "0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F", //xftm
          controller.address
        );
        //fsm -> ftm
        await strategy7.setFirebirdPairs("0xaa621D2002b5a6275EF62d7a065A865167914801", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", ["0x457C8Efcd523058dd58CF080533B41026788eCee"]);
        //fsm -> xftm
        await strategy7.setFirebirdPairs("0xaa621D2002b5a6275EF62d7a065A865167914801", "0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F", ["0xbEa8E843c0fD428f79a166EaE2671E3a8Cc39A0a"]);


        //FSM-FTM spirit
        let strategy6 = await new StrategySushiMiniV2LpFactory(deployerMainnet).deploy();
        await strategy6.initialize(
          "0x457C8Efcd523058dd58CF080533B41026788eCee",
          ["0xaa621D2002b5a6275EF62d7a065A865167914801"],
          "0x7aeE1FF33E1b7F6D874D488fb2533a79419ca240",
          0,
          "0xaa621D2002b5a6275EF62d7a065A865167914801", //fsm
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //ftm
          "0xaa621D2002b5a6275EF62d7a065A865167914801",
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
          controller.address
        );
        //fsm -> ftm
        await strategy6.setFirebirdPairs("0xaa621D2002b5a6275EF62d7a065A865167914801", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", ["0x457C8Efcd523058dd58CF080533B41026788eCee"]);


        //GSCARAB-FTM Spirit
        let strategy5 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy5.initialize(
          "0x27228140D72a7186F70eD3052C3318f2D55c404d",
          "0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6",
          "0xc88690163b10521d5fB86c2ECB293261F7771525",
          1,
          "0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6",
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //wftm
          "0x6ab5660f0b1f174cfa84e9977c15645e4848f5d6",
          "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
          controller.address
        );
        //GSCARAB -> WFTM
        await strategy5.setFirebirdPairs("0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", ["0x27228140D72a7186F70eD3052C3318f2D55c404d"]);


        //SCARAB-FTM Spirit
        let strategy4 = await new StrategySushiLpFactory(deployerMainnet).deploy();
        await strategy4.initialize(
          "0x78e70eF4eE5cc72FC25A8bDA4519c45594CcD8d4",
          "0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6",
          "0xc88690163b10521d5fB86c2ECB293261F7771525",
          0,
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //wftm
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
          "0x2e79205648b85485731cfe3025d66cf2d3b059c4",
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
          controller.address
        );
        //GSCARAB -> WFTM
        await strategy4.setFirebirdPairs("0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", ["0x27228140D72a7186F70eD3052C3318f2D55c404d"]);
        //WFTM -> SCARAB
        await strategy4.setFirebirdPairs("0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", "0x2e79205648b85485731cfe3025d66cf2d3b059c4", ["0x78e70eF4eE5cc72FC25A8bDA4519c45594CcD8d4"]);


        //wFTM-DAI 50/50 Beetx
        let strategy3 = await new StrategyBalancerLpFactory(deployerMainnet).deploy();
        await strategy3.initialize(
          "0x63386eF152E1Ddef96c065636D6cC0165Ff33291",
          ["0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e"],
          "0x8166994d9ebBe5829EC86Bd81258149B87faCfd3",
          23,
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //ftm
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", //ftm
          "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
          controller.address
        );
        //beets -> wftm
        await strategy3.setBalancerPoolPaths("0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", "0xcde5a11a4acb4ee4c805352cec57e236bdbc3837000200000000000000000019");


        //wFTM-USDC 70/30 Beetx
        let strategy2 = await new StrategyBalancerLpFactory(deployerMainnet).deploy();
        await strategy2.initialize(
          "0xcdf68a4d525ba2e90fe959c74330430a5a6b8226",
          ["0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e"],
          "0x8166994d9ebBe5829EC86Bd81258149B87faCfd3",
          8,
          "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", //usdc
          "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", //usdc
          "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
          controller.address
        );
        //beets -> usdc
        await strategy2.setBalancerPoolPaths("0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e", "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", "0x03c6b3f09d2504606936b1a4decefad204687890000200000000000000000015");


        //BEETS-USDC 80/20 Beetx
        let strategy1 = await new StrategyBalancerLpFactory(deployerMainnet).deploy();
        await strategy1.initialize(
          "0x03c6b3f09d2504606936b1a4decefad204687890",
          ["0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e"],
          "0x8166994d9ebBe5829EC86Bd81258149B87faCfd3",
          0,
          "0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e", //beets
          "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", //usdc
          "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
          controller.address
        );
        //beets -> usdc
        await strategy1.setBalancerPoolPaths("0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e", "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", "0x03c6b3f09d2504606936b1a4decefad204687890000200000000000000000015");


        //BEETS-wFTM 80/20 Beetx
        let strategy0 = await new StrategyBalancerLpFactory(deployerMainnet).deploy();
        await strategy0.initialize(
          "0xcdE5a11a4ACB4eE4c805352Cec57E236bdBC3837",
          ["0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e"],
          "0x8166994d9ebBe5829EC86Bd81258149B87faCfd3",
          9,
          "0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e", //beets
          "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", //usdc
          "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
          controller.address
        );
        //beets -> usdc
        await strategy0.setBalancerPoolPaths("0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e", "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", "0x03c6b3f09d2504606936b1a4decefad204687890000200000000000000000015");
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
