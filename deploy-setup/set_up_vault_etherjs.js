const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x6fA867BBFDd025780a8CFE988475220AfF51FB8b';
let vaultAddress = '0x6AdB801f90C09EAc4df2126f33Ac7b196578507E';
let controllerAddress = '0xd47636621C49d42cfEC9C39696b90726B7b54c66';
let strategyAddress = '0x35F113Beb0b3d28274AF13c5aeA75ca996c473a5';

let vaultName = 'Vault:DfynDFYNWETH';
let vaultSymbol = 'vaultDFYNWETH';
let controllerName = 'VaultController:DfynDFYNWETH';

const main = async () => {
  console.log('Run job', new Date());
  const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
  wallet = new ethers.Wallet(ownerPrivateKey, provider);
  const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

  let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
  gasPrice = gasPrice.mul(16);
  overrides = {gasLimit: 900000, gasPrice};

  let tx;
  let vaultContract = new Contract(vaultAddress, VaultABI, wallet);
  let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
  let strategyContract = new Contract(strategyAddress, StrategyABI, wallet);
  console.log('Current nonce', await wallet.getTransactionCount(), await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

  //vault
  tx = await vaultContract.populateTransaction.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol);
  await processTx(tx, 'RECEIPT vault init');

  //controller
  tx = await controllerContract.populateTransaction.initialize(vaultAddress, controllerName);
  await processTx(tx, 'RECEIPT controller init');

  // strategy
  tx = await strategyContract.populateTransaction.initialize(
    '0x6fA867BBFDd025780a8CFE988475220AfF51FB8b',
    '0xAa9654BECca45B5BDFA5ac646c939C62b527D394',
    '0x1948abC5400Aa1d72223882958Da3bec643fb4E5',
    1,
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', //eth
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', //eth
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
    '0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97',
    controllerAddress
  );
  await processTx(tx, 'RECEIPT strategy init');

  tx = await strategyContract.populateTransaction.setFirebirdPairs('0xAa9654BECca45B5BDFA5ac646c939C62b527D394', '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', [
    '0x3324af8417844e70b81555A6D1568d78f4D4Bf1f',
    '0x39D736D2b254eE30796f43Ec665143010b558F82'
  ]);
  await processTx(tx, 'RECEIPT strategy');

  tx = await strategyContract.populateTransaction.setFirebirdPairs('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', '0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97', [
    '0x6fA867BBFDd025780a8CFE988475220AfF51FB8b'
  ]);
  await processTx(tx, 'RECEIPT strategy');

  // vault governance
  tx = await vaultContract.populateTransaction.setController(controllerAddress);
  await processTx(tx, 'RECEIPT vault');

  // controller strategist
  tx = await controllerContract.populateTransaction.approveStrategy(strategyAddress);
  await processTx(tx, 'RECEIPT controller');

  tx = await controllerContract.populateTransaction.setStrategyInfo('0', strategyAddress, maxUint256, '100');
  await processTx(tx, 'RECEIPT controller');

  tx = await controllerContract.populateTransaction.setStrategyLength('1');
  await processTx(tx, 'RECEIPT controller');

  console.log('--------Finished job', new Date());
};

const processTx = async (tx, message) => {
  await wallet.estimateGas(tx);
  let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
  console.log(message, new Date(), receipt.transactionHash);
};

main();

/**
 * Deploy vault step
 * (vault with withdrawal fee must be the last one to withdraw in sequence)
 * ------------------------
 Flat contract - Remove and add only single MIT - prettier
 Deploy vault, controller, strategy
 script set_up_vault (update ABI, address vault/controller/strategy, name, config for strategy ...)
 test deposit to vault, withdraw from vault
 test pending receive, withdrawAll, retireStrat, harvest in strategy
 check price per share in vault
 script update_governance (address vault/controller/strategy)

 * Migrate new strategy step
 * -------------------------
 Controller approveStrategy strategy
 Master addStrategy
 pause vault if have
 Set percent 1% old 9% new
 setstrategylength

 Get best strategy
 Deposit to new strategy
 Test withdraw all new strategy
 harvest new strategy

 harvestAllStrategy
 WithdrawAll controller to strategy old
 Set percent 0% old 10% new
 Setstrategylength
 unpause vault if have
 Check best strategy
 Call earn in vault
 */
