const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyPairWeightLp.sol/StrategyPairWeightLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x4036201071D148326c1F0D42AeCb8D265f28eCe0';

let baseToken = '0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18';
let vaultAddress = '0xc19B182a24823F05f112265789C97A1D1eA74F0b';
let controllerAddress = '0xAae6556f8F28303DdBd99eC760DD61246392e329';
let strategyAddress = '0x2465E2bCEB7b82992f7b3D855621B7Eb069cE405';

let vaultName = 'Vault:FirebirdWMATICsMATIC';
let vaultSymbol = 'vaultWMATICsMATIC';
let controllerName = 'VaultController:FirebirdWMATICsMATIC';

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
    gasPrice = BigNumber(gasPrice).times(12);
    let method;
    let txReceipt;
    let vaultContract = new web3.eth.Contract(VaultABI, vaultAddress);
    let controllerContract = new web3.eth.Contract(ControllerABI, controllerAddress);
    let strategyContract = new web3.eth.Contract(StrategyABI, strategyAddress);
    console.log('Current nonce', await web3.eth.getTransactionCount(from), await web3.eth.getTransactionCount(from, 'pending'), gasPrice.div(1e9).toString(), 'Gwei');

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
        '0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18',
        '0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54',
        '0x69E7Bbe85db0364397378364458952bEcB886920',
        4,
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', //matic
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        50,
        '0xc1ac5c0b73ba01a31c93884c28a31e9985842c38',
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', [
        '0x46A30dFece0E0fc0977eefd15bd0595fdDe15a10',
        '0xCe2cB67b11ec0399E39AF20433927424f9033233'
    ]);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', '0xc1ac5c0b73ba01a31c93884c28a31e9985842c38', ['0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // vault governance
    method = vaultContract.methods.setController(controllerAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT vault', new Date(), txReceipt.transactionHash);

    // controller strategist
    method = controllerContract.methods.setUseSingleStrategy(strategyAddress);
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
