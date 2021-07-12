const Web3 = require('web3');
require('dotenv').config();
const BigNumber = require('bignumber.js');
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiMiniV2Lp.sol/StrategySushiMiniV2Lp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5';
let vaultAddress = '0xc95dAdE0bF3aBEc85bc3185f643812e0575C052e';
let controllerAddress = '0x367Ab6A681Fb3293D7e5b7a1FF42CA009B514014';
let strategyAddress = '0x885A5F41cf95D1f9920506cB15Fc1FB335dA1117';

let vaultName = 'Vault:FirebirdICEWETH';
let vaultSymbol = 'vaultICEWETH';
let controllerName = 'VaultController:FirebirdICEWETH';

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
    gasPrice = BigNumber(gasPrice).times(10);
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
        '0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5',
        ['0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef'],
        '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD',
        1,
        '0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef', //ice
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', //eth
        '0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef',
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef', '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', ['0xf1EE78544a1118F2efb87f7EaCd9f1E6e80e1ea5']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 900000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // method = strategyContract.methods.setFirebirdPairs('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', ['0x7641d6b873877007697D526EF3C50908779a6993']);
    // await method.estimateGas({from});
    // txReceipt = await method.send({from, gas: 900000, gasPrice});
    // console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

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
