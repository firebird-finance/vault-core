const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyPolycatLp.sol/StrategyPolycatLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xCdf59DE1d771E265aD8A1571532181e137258f44';
let vaultAddress = '0xaeDd5dceC012a4608952598795c3c26084340f0b';
let controllerAddress = '0xA305E4f8C2cf42F9D621051A9B1F2527e7017676';
let strategyAddress = '0xBf9fD1f4dE0582f0E2a26E7dd67992a508fa8720';

let vaultName = 'Vault:PolyCatPAWV2WMATIC';
let vaultSymbol = 'vaultPAWV2WMATIC';
let controllerName = 'VaultController:PolyCatPAWV2WMATIC';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(66);
    if (gasPrice.gt(BigNumber.from(5e11))) gasPrice = BigNumber.from(3e11);
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
        '0xCdf59DE1d771E265aD8A1571532181e137258f44',
        '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
        '0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a',
        0,
        '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', //matic
        '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        controllerAddress
    );
    await processTx(tx, 'RECEIPT strategy init');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', [
        '0xCdf59DE1d771E265aD8A1571532181e137258f44'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0x2791bca1f2de4661ed88a30c99a7a9449aa84174', '0x3a3df212b7aa91aa0402b9035b098891d276572b', [
        '0xbFf681C59158EA5Cf7d29e439cB701a9bB8B79F8'
    ]);
    await processTx(tx, 'RECEIPT strategy');

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
