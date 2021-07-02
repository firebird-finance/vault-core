const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x46c8BE37Ff8CEdf09B88E457369033876087197e';
let vaultAddress = '0x5F09B9d8757c0Ce1EE6aAdd45323f28e154d3996';
let controllerAddress = '0xF2134dBa5c2bd6640f65B68438F623D28FA6dB68';
let strategyAddress = '0xeeeE220d1a0943d77b7237425418186817ecF288';

let vaultName = 'Vault:FirebirdFISHWMATIC';
let vaultSymbol = 'vaultFISHWMATIC';
let controllerName = 'VaultController:FirebirdFISHWMATIC';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `http://18.116.97.120:8545/`);
    let web3 = new Web3(provider);
    const maxUint256 = web3.utils
        .toBN(2)
        .pow(web3.utils.toBN(256))
        .sub(web3.utils.toBN(1));

    let [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
    gasPrice = BigNumber(gasPrice).times(10);
    let method;
    let txReceipt;
    let vaultContract = new web3.eth.Contract(VaultABI, vaultAddress);
    let controllerContract = new web3.eth.Contract(ControllerABI, controllerAddress);
    let strategyContract = new web3.eth.Contract(StrategyABI, strategyAddress);

    //vault
    method = vaultContract.methods.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT vault init', new Date(), txReceipt.transactionHash);

    //controller
    method = controllerContract.methods.initialize(vaultAddress, controllerName);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT controller init', new Date(), txReceipt.transactionHash);

    // strategy
    method = strategyContract.methods.initialize(
        '0x46c8BE37Ff8CEdf09B88E457369033876087197e',
        '0x3a3df212b7aa91aa0402b9035b098891d276572b',
        '0x8cfd1b9b7478e7b0422916b72d1db6a9d513d734',
        26,
        '0x3a3df212b7aa91aa0402b9035b098891d276572b', //fish
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', //matic
        '0x3a3df212b7aa91aa0402b9035b098891d276572b',
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x3a3df212b7aa91aa0402b9035b098891d276572b', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', ['0x46c8BE37Ff8CEdf09B88E457369033876087197e']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // vault governance
    method = vaultContract.methods.setController(controllerAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT vault', new Date(), txReceipt.transactionHash);

    // controller strategist
    method = controllerContract.methods.approveStrategy(strategyAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    method = controllerContract.methods.setStrategyInfo('0', strategyAddress, maxUint256, '100');
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    method = controllerContract.methods.setStrategyLength('1');
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    console.log('--------Finished job', new Date());
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
