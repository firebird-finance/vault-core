import {ethers} from "hardhat";
import {fromWei} from "../test/shared/utilities";

async function main() {
    const accounts = await ethers.getSigners();
    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        console.log("Accounts:", i, await acc.getAddress(), fromWei(await acc.getBalance()).toString());
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
