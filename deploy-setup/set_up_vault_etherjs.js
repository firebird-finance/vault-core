const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyQuickLp.sol/StrategyQuickLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x327Be6353F28dD021d1E4eFF10c92767E49604d1';
let vaultAddress = '0x937Efd0CD33d80dDc1a26b98A8E2E24a11c17863';
let controllerAddress = '0x71a34164Ad4A412A62c00716BF9C3508Fc67d573';
let strategyAddress = '0x4f81307e332Fb11783A1BC0a90F9f8600FCf6973';

let vaultName = 'Vault:DfynAGADFYN';
let vaultSymbol = 'vaultAGADFYN';
let controllerName = 'VaultController:DfynAGADFYN';

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
        '0x327Be6353F28dD021d1E4eFF10c92767E49604d1',
        '0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97',
        '0x2CaAA00D4505aD79FA75C06c475828e47B01C042',
        '0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97', //dfyn
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
        '0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97',
        '0x033d942a6b495c4071083f4cde1f17e986fe856c',
        controllerAddress
    );
    await processTx(tx, 'RECEIPT strategy init');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', [
        '0x4c38938E21cB9796932B0B0Cc3f8a088f07b49B0'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0xc168e40227e4ebd8c1cae80f7a55a4f0e6d66c97', '0x033d942a6b495c4071083f4cde1f17e986fe856c', [
        '0x327Be6353F28dD021d1E4eFF10c92767E49604d1'
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
