const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const ownerPrivateKey = process.env.MNEMONICCCC;
let wallet, overrides;
let deployerMainnet = '0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c';

let vaultsAddress = [];
let controllersAddress = [];
let strategiesAddress = [];

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider("https://rpcapi.fantom.network");
    wallet = new ethers.Wallet(ownerPrivateKey, provider);

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    overrides = {gasLimit: 200000, gasPrice};
    let nonce;
    console.log('Current nonce', await wallet.getTransactionCount(), await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

    // vault governance
    nonce = await wallet.getTransactionCount();
    await Promise.all(
        vaultsAddress.map(async (vaultAddress, index) => {
            let vaultContract = new Contract(vaultAddress, ControllerABI, wallet);
            let tx = await vaultContract.populateTransaction.setGovernance(deployerMainnet, {nonce: nonce + index});
            await processTx(tx, 'RECEIPT vault', vaultAddress, index);
        })
    );

    // controller strategist
    nonce = await wallet.getTransactionCount();
    await Promise.all(
        controllersAddress.map(async (controllerAddress, index) => {
            let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
            let tx1 = await controllerContract.populateTransaction.setStrategist(deployerMainnet, {nonce: nonce + index * 2});
            let tx2 = await controllerContract.populateTransaction.setGovernance(deployerMainnet, {nonce: nonce + index * 2 + 1});

            await Promise.all([processTx(tx1, 'RECEIPT controller strategist', controllerAddress, index), processTx(tx2, 'RECEIPT controller governance', controllerAddress, index)]);
        })
    );

    // strategy
    nonce = await wallet.getTransactionCount();
    await Promise.all(
        strategiesAddress.map(async (strategyAddress, index) => {
            let strategyContract = new Contract(strategyAddress, ControllerABI, wallet);
            let txs = [];
            // txs.push(await strategyContract.populateTransaction.setStrategist(deployerMainnet, {nonce: nonce++}));

            // governance
            txs.push(await strategyContract.populateTransaction.setGovernance(deployerMainnet, {nonce: nonce++}));
            await processBatchTxs(txs, 'RECEIPT strategy', strategyAddress, index);
        })
    );

    console.log('--------Finished job', new Date());
};

const processTx = async (tx, ...message) => {
    await wallet.estimateGas(tx);
    let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
    console.log(...message, new Date(), receipt.transactionHash);
};

const processBatchTxs = async (txs, ...message) => {
    await Promise.all(
        txs.map(async tx => {
            await processTx(tx, ...message);
        })
    );
};

main();
