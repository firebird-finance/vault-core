const Web3 = require('web3');
require('dotenv').config();
const VaultABI = require('../../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../../artifacts/contracts/compositevaults/strategies/StrategyCurveStable.sol/StrategyCurveStable.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171';
let vaultAddress = '0xaCd881B86621D6eEC239C81B32Ab572580d62C5C';
let controllerAddress = '0x94CA290CACEcB00ac234f91CE1d46543351573A1';
let strategyAddress = '0x86a8678c3E3A57DA4FfD42eCFA41a131b3e6D291';

let vaultName = 'Vault:am3CRV';
let vaultSymbol = 'vaultA3CRV';
let controllerName = 'VaultController:am3CRV';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://rpc-mainnet.maticvigil.com/`);
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
        '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
        '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        '0xe381C25de995d62b453aF8B931aAc84fcCaa7A62',
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
        1,
        '0x445FE580eF8d70FF569aB36e80c647af338db351',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', ['0xcd353f79d9fade311fc3119b841e1f456b54e858']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // method = strategyContract.methods.setFirebirdPairs('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', ['0xdc9232e2df177d7a12fdff6ecbab114e2231198d']);
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
