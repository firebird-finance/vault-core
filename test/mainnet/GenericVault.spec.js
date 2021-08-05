const {deployments} = require('hardhat');
const {expect} = require('../chai-setup');
const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const {maxUint256} = require('../shared/utilities');
const VaultABI = require('../../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;

let baseToken = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
let vaultAddress = '0x08EEAf23F605D040d07320a4C7E22BC5824ee59C';
let controllerAddress = '0xcE1bf057D92ceE46bBc39a0002899c796c464D69';
let strategyAddress = '0x87BDb433786C6e0b4477c5b17BDF0BC85a6b5b0b';

let depositAmount = maxUint256;
// let depositAmount = BigNumber.from("1000000");

describe('GenericVault', function() {
  let baseTokenContract, vaultContract, controllerContract, strategyContract;

  before(async function() {
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(120);
    overrides = {gasLimit: 1600000, gasPrice};

    baseTokenContract = new Contract(baseToken, VaultABI, wallet);
    vaultContract = new Contract(vaultAddress, VaultABI, wallet);
    controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
    strategyContract = new Contract(strategyAddress, StrategyABI, wallet);
    console.log('Current nonce', await wallet.getTransactionCount(), await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');
  });

  describe('Deposit', function() {
    it('deposit want token', async () => {
      if (depositAmount === maxUint256) {
        depositAmount = await baseTokenContract.balanceOf(wallet.address);
      }

      expect(depositAmount).is.gt(0);

      const currentApprove = await baseTokenContract.allowance(wallet.address, vaultAddress);
      if (currentApprove.eq(0)) {
        const txApprove = await baseTokenContract.populateTransaction.approve(vaultAddress, maxUint256);
        await processTx(txApprove, 'RECEIPT token approve');
      }
      const tx = await vaultContract.populateTransaction.deposit(depositAmount, 1);
      await processTx(tx, 'RECEIPT vault deposit');
    });

    it('receive vault token', async () => {
      const vaultToken = await vaultContract.balanceOf(wallet.address);
      expect(vaultToken).is.gt(0);
    });
  });

  describe('Strategy info', function() {
    it('vault have balance', async () => {
      const vaultBalance = await vaultContract.balance();
      expect(vaultBalance).is.gt(0);
    });

    it('strategy have balance', async () => {
      const strategyBalance = await strategyContract.balanceOf();
      expect(strategyBalance).is.gt(0);
    });

    it('strategy have balance in farm', async () => {
      const strategyBalance = await strategyContract.balanceOfPool();
      expect(strategyBalance).is.gt(0);
    });

    it('strategy have pending balance', async () => {
      const strategyPending = await strategyContract.claimable_token();
      expect(strategyPending[1]).is.gt(0);
    });

    it('Can withdrawAll from strategy', async () => {
      const tx = await strategyContract.populateTransaction.withdrawAll();
      await wallet.estimateGas(tx);
    });

    it('Can retireStrat from strategy', async () => {
      const tx = await strategyContract.populateTransaction.retireStrat();
      await wallet.estimateGas(tx);
    });
  });

  describe('Can harvest', function() {
    it('harvest all strategies', async () => {
      const tx = await vaultContract.populateTransaction.harvestAllStrategies();

      const priceShare = await vaultContract.getPricePerFullShare();
      if (priceShare.eq(BigNumber.from('1000000000000000000'))) {
        await processTx(tx, 'RECEIPT vault harvest');
      }
    });

    it('price share is increase', async () => {
      const priceShare = await vaultContract.getPricePerFullShare();
      expect(priceShare).is.gt(BigNumber.from('1000000000000000000'));
    });
  });

  describe('Can withdraw', function() {
    it('withdraw all want token', async () => {
      const vaultToken = await vaultContract.balanceOf(wallet.address);

      expect(vaultToken).is.gt(0);
      const tx = await vaultContract.populateTransaction.withdraw(vaultToken, 1);
      await wallet.estimateGas(tx);
    });
  });
});

const processTx = async (tx, message) => {
  await wallet.estimateGas(tx);
  let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
  console.log(message, new Date(), receipt.transactionHash);
};
