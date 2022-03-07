const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiMiniV2Lp.sol/StrategySushiMiniV2Lp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCCC;
let wallet, overrides;
let vaultMasterAddress = '0x4036201071D148326c1F0D42AeCb8D265f28eCe0';

let baseToken = '0x457C8Efcd523058dd58CF080533B41026788eCee';
let vaultAddress = '0x1fd4B94a2Fad477f3FC822fB29934348A84f52Cc';
let controllerAddress = '0xC8F06566dae14e9f8f20368A5931d7be8A3F29b6';
let strategyAddress = '0x9dd8930D7994581E6B09E12be0684eFCd2A476c5';

let vaultName = 'Vault:SpiritFSMWFTM';
let vaultSymbol = 'vaultFSMWFTM';
let controllerName = 'VaultController:SpiritFSMWFTM';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider('https://rpc.ankr.com/fantom');
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    overrides = {gasLimit: 900000, gasPrice};

    let txs = [],
        msgs = [];
    let vaultContract = new Contract(vaultAddress, VaultABI, wallet);
    let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
    let strategyContract = new Contract(strategyAddress, StrategyABI, wallet);
    let nonce = await wallet.getTransactionCount();
    console.log('Current nonce', nonce, await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

    //vault
    txs.push(await vaultContract.populateTransaction.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol, {nonce: nonce++}));
    msgs.push('RECEIPT vault init');

    //controller
    txs.push(await controllerContract.populateTransaction.initialize(vaultAddress, controllerName, {nonce: nonce++}));
    msgs.push('RECEIPT controller init');

    // strategy
    txs.push(
        await strategyContract.populateTransaction.initialize(
            '0x457C8Efcd523058dd58CF080533B41026788eCee',
            ['0xaa621D2002b5a6275EF62d7a065A865167914801'],
            '0x7aeE1FF33E1b7F6D874D488fb2533a79419ca240',
            0,
            '0xaa621D2002b5a6275EF62d7a065A865167914801', //fsm
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', //ftm
            '0xaa621D2002b5a6275EF62d7a065A865167914801',
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0xaa621D2002b5a6275EF62d7a065A865167914801',
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            ['0x457C8Efcd523058dd58CF080533B41026788eCee'],
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    // txs.push(
    //     await strategyContract.populateTransaction.setFirebirdPairs(
    //         '0xaa621D2002b5a6275EF62d7a065A865167914801',
    //         '0xfBD2945D3601f21540DDD85c29C5C3CaF108B96F',
    //         ['0xbEa8E843c0fD428f79a166EaE2671E3a8Cc39A0a'],
    //         {nonce: nonce++}
    //     )
    // );
    // msgs.push('RECEIPT strategy');

    // vault governance
    txs.push(await vaultContract.populateTransaction.setController(controllerAddress, {nonce: nonce++}));
    msgs.push('RECEIPT vault');

    // controller strategist
    txs.push(await controllerContract.populateTransaction.setUseSingleStrategy(strategyAddress, {nonce: nonce++}));
    msgs.push('RECEIPT controller');

    await processBatchTx(txs, msgs);

    console.log('--------Finished job', new Date());
};

const processTx = async (tx, ...message) => {
    // await wallet.estimateGas(tx);
    let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
    console.log(...message, new Date(), receipt.transactionHash, receipt.status ? '' : 'FAILED!!!!');
};

const processBatchTx = async (txs, messages) => {
    await Promise.all(
        txs.map(async (tx, index) => {
            await processTx(tx, messages[index]);
        })
    );
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
