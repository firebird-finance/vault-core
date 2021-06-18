const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCC;
let vaultMasterAddress = '0x412b30F7c14527a7cEab3aC07945Eb14faA201c7';

let baseToken = '0xe7fbB8bd95322618e925affd84D7eC0E32DC0e57';
let vaultAddress = '0x911b6B20410983A6C4f39598BB53fC908Ec40b48';
let controllerAddress = '0xE7b3d97616eF8Ef43042878Bad9E2FB4DD578007';
let strategyAddress = '0xe24EC9409989ceB5E9C37Dd2289a670f45611F46';

let vaultName = 'Vault:BiswapDOTWBNB';
let vaultSymbol = 'vaultDOTWBNB';
let controllerName = 'VaultController:BiswapDOTWBNB';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://bsc-dataseed.binance.org/`);
    let web3 = new Web3(provider);
    const maxUint256 = web3.utils
        .toBN(2)
        .pow(web3.utils.toBN(256))
        .sub(web3.utils.toBN(1));

    let [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
    let method;
    let txReceipt;
    let vaultContract = new web3.eth.Contract(VaultABI, vaultAddress);
    let controllerContract = new web3.eth.Contract(ControllerABI, controllerAddress);
    let strategyContract = new web3.eth.Contract(StrategyABI, strategyAddress);

    //vault
    method = vaultContract.methods.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT vault init', new Date(), txReceipt.transactionHash);

    //controller
    method = controllerContract.methods.initialize(vaultAddress, controllerName);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller init', new Date(), txReceipt.transactionHash);

    // strategy
    method = strategyContract.methods.initialize(
        '0xe7fbB8bd95322618e925affd84D7eC0E32DC0e57',
        '0x965f527d9159dce6288a2219db51fc6eef120dd1',
        '0xDbc1A13490deeF9c3C12b44FE77b503c1B061739',
        14,
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', //bnb
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', //bnb
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x965f527d9159dce6288a2219db51fc6eef120dd1', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', ['0x46492B26639Df0cda9b2769429845cb991591E0A']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402', ['0xe7fbB8bd95322618e925affd84D7eC0E32DC0e57']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // vault governance
    method = vaultContract.methods.setController(controllerAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT vault', new Date(), txReceipt.transactionHash);

    // controller strategist
    method = controllerContract.methods.approveStrategy(strategyAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    method = controllerContract.methods.setStrategyInfo('0', strategyAddress, maxUint256, '100');
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    method = controllerContract.methods.setStrategyLength('1');
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
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
