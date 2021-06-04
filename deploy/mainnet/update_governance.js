const Web3 = require('web3');
require('dotenv').config();
const ControllerABI = require('../../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let deployerMainnet = '0xA20CA7c6705fB88847Cbf50549D7A38f4e99d32c';

let vaultsAddress = ['0x33e770DF8bB4af69b653312Ffa31b060f5c4FEB3'];
let controllersAddress = ['0xf5B7359e0dE30B11fDFFf26e39d9498B7640bAC4'];
let strategiesAddress = ['0x7E84210074B3Bd12028d703412D31C0DF4a80715'];

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://bsc-dataseed2.ninicoin.io`);
    let web3 = new Web3(provider);

    const [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
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
