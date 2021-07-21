const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let deployerMainnet = '0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c';

let vaultsAddress = [];
let controllersAddress = [];
let strategiesAddress = [];

const main = async () => {
  console.log('Run job', new Date());
  const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
  wallet = new ethers.Wallet(ownerPrivateKey, provider);

  let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
  gasPrice = gasPrice.mul(16);
  overrides = {gasLimit: 200000, gasPrice};
  let tx;
  console.log('Current nonce', await wallet.getTransactionCount(), await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

  // vault governance
  for (const vaultAddress of vaultsAddress) {
    let vaultContract = new Contract(vaultAddress, ControllerABI, wallet);
    tx = await vaultContract.populateTransaction.setGovernance(deployerMainnet);
    await processTx(tx, 'RECEIPT vault');
  }

  // controller strategist
  for (const controllerAddress of controllersAddress) {
    let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
    tx = await controllerContract.populateTransaction.setStrategist(deployerMainnet);
    await processTx(tx, 'RECEIPT controller strategist');

    // controller governance
    tx = await controllerContract.populateTransaction.setGovernance(deployerMainnet);
    await processTx(tx, 'RECEIPT controller governance');
  }

  // strategy
  for (const strategyAddress of strategiesAddress) {
    let strategyContract = new Contract(strategyAddress, ControllerABI, wallet);
    // tx = await strategyContract.populateTransaction.setStrategist(deployerMainnet);
    // await processTx(tx, 'RECEIPT strategy');

    // governance
    tx = await strategyContract.populateTransaction.setGovernance(deployerMainnet);
    await processTx(tx, 'RECEIPT strategy');
  }

  console.log('--------Finished job', new Date());
};

const processTx = async (tx, message) => {
  await wallet.estimateGas(tx);
  let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
  console.log(message, new Date(), receipt.transactionHash);
};

main();
