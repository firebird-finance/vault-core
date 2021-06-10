const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyHopeChefStableSwapLp.sol/StrategyHopeChefStableSwapLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xC45c1087a6eF7A956af96B0fEED5a7c270f5C901';
let vaultAddress = '0x87064A143fC73Cff13690D63964F851be063ef99';
let controllerAddress = '0xD673480b8a0ba784B76b82B763aDE3b55EAF7b78';
let strategyAddress = '0xDdE02514796d3071929B21db069755a21ba0AeaF';

let vaultName = 'Vault:IRON3pool';
let vaultSymbol = 'vaultIRON3pool';
let controllerName = 'VaultController:IRON3pool';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://rpc-mainnet.maticvigil.com/`);
    let web3 = new Web3(provider);
    const maxUint256 = web3.utils
        .toBN(2)
        .pow(web3.utils.toBN(256))
        .sub(web3.utils.toBN(1));

    let [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
    gasPrice = BigNumber(gasPrice).times(2);
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
        '0xC45c1087a6eF7A956af96B0fEED5a7c270f5C901',
        '0xd78c475133731cd54dadcb430f7aae4f03c1e660',
        '0xE9a8b6ea3e7431E6BefCa51258CB472Df2Dd21d4',
        8,
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
        '0x563E49a74fd6AB193751f6C616ce7Cf900D678E5',
        '0x01C9475dBD36e46d1961572C8DE24b74616Bae9e',
        1,
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0xd78c475133731cd54dadcb430f7aae4f03c1e660', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', [
        '0xdd600F769a6BFe5Dac39f5DA23C18433E6d92CBa',
        '0x39D736D2b254eE30796f43Ec665143010b558F82'
    ]);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', ['0x10F525CFbCe668815Da5142460af0fCfb5163C81']);
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
