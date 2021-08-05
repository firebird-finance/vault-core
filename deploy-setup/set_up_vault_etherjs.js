const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyVenusLeverage.sol/StrategyVenusLeverage.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
let vaultAddress = '0x59Ff10e411F8040d3db4bE2ef187E9493f90D86C';
let controllerAddress = '0x6670Ae26751F4701778a828136882d65b2DBC1a7';
let strategyAddress = '0x31fb7a11338a0749Bb8c2e122d88953cE3880655';

let vaultName = 'Vault:USDT';
let vaultSymbol = 'vaultUSDT';
let controllerName = 'VaultController:USDT';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(88);
    overrides = {gasLimit: 900000, gasPrice};

    let tx;
    let vaultContract = new Contract(vaultAddress, VaultABI, wallet);
    let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
    let strategyContract = new Contract(strategyAddress, StrategyABI, wallet);
    console.log('Current nonce', await wallet.getTransactionCount(), await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

    //vault
    tx = await vaultContract.populateTransaction.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol);
    await processTx(tx, 'RECEIPT vault init');

    //controller
    tx = await controllerContract.populateTransaction.initialize(vaultAddress, controllerName);
    await processTx(tx, 'RECEIPT controller init');

    // strategy
    tx = await strategyContract.populateTransaction.initialize(
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        '0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef',
        '0xad6ad29d6b8b74b4302dd829c945ca3274035c16',
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        '0',
        '0',
        controllerAddress
    );
    await processTx(tx, 'RECEIPT strategy init');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', [
        '0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5',
        '0xc7f1B47F4ed069E9B34e6bD59792B8ABf5a66339'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    // tx = await strategyContract.populateTransaction.setFirebirdPairs('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', '0x692597b009d13c4049a947cab2239b7d6517875f', [
    //     '0x39BEd7f1C412ab64443196A6fEcb2ac20C707224'
    // ]);
    // await processTx(tx, 'RECEIPT strategy');

    // vault governance
    tx = await vaultContract.populateTransaction.setController(controllerAddress);
    await processTx(tx, 'RECEIPT vault');

    // controller strategist
    tx = await controllerContract.populateTransaction.setUseSingleStrategy(strategyAddress);
    await processTx(tx, 'RECEIPT controller');

    console.log('--------Finished job', new Date());
};

const processTx = async (tx, message) => {
    await wallet.estimateGas(tx);
    let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
    console.log(message, new Date(), receipt.transactionHash);
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
