const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x527e43ca8f600f120b1eaEe2aFc80E3Cb375e191';
let vaultAddress = '0x97E2b8d22899E9d5727d8668F9C6f476B5060314';
let controllerAddress = '0x49C567444fc3D576b40a3FC66533909B836ad30b';
let strategyAddress = '0x26F68f1cd6521b15162241C01e58991f2597F6Aa';

let vaultName = 'Vault:SushiWMATICxUSD';
let vaultSymbol = 'vaultWMATICxUSD';
let controllerName = 'VaultController:SushiWMATICxUSD';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(120);
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
        '0x527e43ca8f600f120b1eaEe2aFc80E3Cb375e191',
        '0x7917FB62b993511320Eee5ad70E98D49356580C9',
        '0xe681c22Dc729E88559a0607ACa4b136Cc9998A6F',
        3,
        '0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975', //xUSD
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
        '0x3a3e7650f8b9f667da98f236010fbf44ee4b2975',
        controllerAddress
    );
    await processTx(tx, 'RECEIPT strategy init');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0x7917FB62b993511320Eee5ad70E98D49356580C9', '0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975', [
        '0xD52bF3AC296F9ed1171e48e5ef248Fb217fBfCfD',
        '0x527e43ca8f600f120b1eaEe2aFc80E3Cb375e191'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0x3A3e7650f8B9f667dA98F236010fBf44Ee4B2975', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', [
        '0x527e43ca8f600f120b1eaEe2aFc80E3Cb375e191'
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
