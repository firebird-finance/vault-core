const {ethers, providers, Contract} = require('ethers');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyPairWeightLp.sol/StrategyPairWeightLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171';
let vaultAddress = '0xaCd881B86621D6eEC239C81B32Ab572580d62C5C';
let controllerAddress = '0x94CA290CACEcB00ac234f91CE1d46543351573A1';
let strategyAddress = '0x8a1892Ea79dd34aDFB1160A3b1836F4776126896';

let vaultName = 'Vault:FirebirdWMATICsMATIC';
let vaultSymbol = 'vaultWMATICsMATIC';
let controllerName = 'VaultController:FirebirdWMATICsMATIC';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = new BigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(2);
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
    await processTx(tx, 'RECEIPT strategy init');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0xAB72EE159Ff70b64beEcBbB0FbBE58b372391C54', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', [
        '0x46A30dFece0E0fc0977eefd15bd0595fdDe15a10',
        '0xCe2cB67b11ec0399E39AF20433927424f9033233'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', '0xc1ac5c0b73ba01a31c93884c28a31e9985842c38', [
        '0xB949de02e5bB30DaC57460a61aBd4Fcd9c256f18'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    // vault governance
    tx = await vaultContract.populateTransaction.setController(controllerAddress);
    await processTx(tx, 'RECEIPT vault');

    // controller strategist
    tx = await controllerContract.populateTransaction.approveStrategy(strategyAddress);
    await processTx(tx, 'RECEIPT controller');

    tx = await controllerContract.populateTransaction.setStrategyInfo('0', strategyAddress, maxUint256, '100');
    await processTx(tx, 'RECEIPT controller');

    tx = await controllerContract.populateTransaction.setStrategyLength('1');
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
