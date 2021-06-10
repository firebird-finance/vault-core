const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let deployerMainnet = '0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c';

let vaultsAddress = ['0x42CBC14A35C26FA4e15a2411E596fd613668cfb6'];
let controllersAddress = ['0xA343A155930012b9EB515D878d7f1455B153db72'];
let strategiesAddress = ['0x351286a9212d159f10F4631886aea6dbc58a151e'];

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://rpc-mainnet.maticvigil.com/`);
    let web3 = new Web3(provider);

    let [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
    gasPrice = BigNumber(gasPrice).times(2);
    let method, txReceipt;

    // vault governance
    for (const vaultAddress of vaultsAddress) {
        let vaultContract = new web3.eth.Contract(ControllerABI, vaultAddress);
        method = vaultContract.methods.setGovernance(deployerMainnet);
        await method.estimateGas({from});
        txReceipt = await method.send({from, gas: 200000, gasPrice});
        console.log('RECEIPT vault', new Date(), txReceipt.transactionHash);
    }

    // controller strategist
    for (const controllerAddress of controllersAddress) {
        let controllerContract = new web3.eth.Contract(ControllerABI, controllerAddress);
        method = controllerContract.methods.setStrategist(deployerMainnet);
        await method.estimateGas({from});
        txReceipt = await method.send({from, gas: 200000, gasPrice});
        console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

        // controller governance
        method = controllerContract.methods.setGovernance(deployerMainnet);
        await method.estimateGas({from});
        txReceipt = await method.send({from, gas: 200000, gasPrice});
        console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);
    }

    // strategy
    for (const strategyAddress of strategiesAddress) {
        let strategyContract = new web3.eth.Contract(ControllerABI, strategyAddress);
        method = strategyContract.methods.setStrategist(deployerMainnet);
        await method.estimateGas({from});
        txReceipt = await method.send({from, gas: 200000, gasPrice});
        console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

        // governance
        method = strategyContract.methods.setGovernance(deployerMainnet);
        await method.estimateGas({from});
        txReceipt = await method.send({from, gas: 200000, gasPrice});
        console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);
    }

    console.log('--------Finished job', new Date());
};

main();
