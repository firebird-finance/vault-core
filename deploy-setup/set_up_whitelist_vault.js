const Web3 = require('web3');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x9F488D7297cFBfe169845f806Fd1865d8c7DB731';

let baseToken = '0x2170Ed0880ac9A755fd29B2688956BD959F933F8';
let vaultAddress = '0xBB9c51fC5aa5D711fed55513ECA5517edEa906aA';
let controllerAddress = '0xA424645B6154eE74C672F319CD25ee539155E71c';
let strategyAddress = '0x271c6C7e872D8525571C3D35AAF22B6f68c3C239';

let vaultName = 'Vault:ETH';
let vaultSymbol = 'vaultETH';
let controllerName = 'VaultController:ETH';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://bsc-dataseed2.ninicoin.io`);
    let web3 = new Web3(provider);
    const maxUint256 = web3.utils
        .toBN(2)
        .pow(web3.utils.toBN(256))
        .sub(web3.utils.toBN(1));

    const [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
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
        '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        '0x8f0528ce5ef7b51152a59745befdd91d97091d2f',
        '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
        '0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F',
        9,
        '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x8f0528ce5ef7b51152a59745befdd91d97091d2f', '0x2170ed0880ac9a755fd29b2688956bd959f933f8', [
        '0xF3CE6Aac24980E6B657926dfC79502Ae414d3083',
        '0x58065F6ca40c000c71c110CeC47Fb57b7cc0B9b9'
    ]);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // method = strategyContract.methods.setFirebirdPairs('0xe9e7cea3dedca5984780bafc599bd69add087d56', '0x4f0ed527e8a95ecaa132af214dfd41f30b361600', [
    //     '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    // ]);
    // await method.estimateGas({from});
    // txReceipt = await method.send({from, gas: 2000000, gasPrice});
    // console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

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
 Controller approve new strategy
 Master add strategy
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
