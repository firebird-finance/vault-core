const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x101640e107C4a72DeC79826768C239F1eB48cc85';
let vaultAddress = '0xf3d4977a8d546EdDFbE78a6855c507a6F61D326c';
let controllerAddress = '0x61d9d2bEED8a222bc862E1bb032Cd56383d99924';
let strategyAddress = '0xb13F5914BD53B4657Eeb857a72a18a569e815fdd';

let vaultName = 'Vault:JetSwapUSDTWMATIC';
let vaultSymbol = 'vaultUSDTWMATIC';
let controllerName = 'VaultController:JetSwapUSDTWMATIC';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, process.env.RPC_URL);
    let web3 = new Web3(provider);
    const maxUint256 = web3.utils
        .toBN(2)
        .pow(web3.utils.toBN(256))
        .sub(web3.utils.toBN(1));

    let [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
    gasPrice = BigNumber(gasPrice).times(22);
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
        '0x101640e107C4a72DeC79826768C239F1eB48cc85',
        '0x845e76a8691423fbc4ecb8dd77556cb61c09ee25',
        '0x4e22399070aD5aD7f7BEb7d3A7b543e8EcBf1d85',
        11,
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', //usdt
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', //usdt
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x845e76a8691423fbc4ecb8dd77556cb61c09ee25', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', ['0xA39a7640790907D4865a74c1F9715715DBd00431']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', ['0x101640e107C4a72DeC79826768C239F1eB48cc85']);
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
