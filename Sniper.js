const { Connection, PublicKey } = require('@solana/web3.js');
const { swapTokens } = require('./SwapCreator');
require('dotenv').config();

class Sniper {
    constructor(config) {
        this.baseToken = config.baseToken;
        this.targetToken = config.targetToken;
        this.buyAmount = config.buyAmount;
        this.sellTargetPercentage = config.sellTargetPrice;
        this.tokenData = config.tokenData;
        this.connection = new Connection(process.env.SOLANA_WS_URL, 'confirmed');
        this.K = Number(config.tokenData.K) / 1000000000000000;
        this.V = parseFloat(config.tokenData.V);
        this.calculatedSellPrice = this.V * (1 + (this.sellTargetPercentage / 100));
        this.vaultSubscriptionId = null;
        this.userSource = process.env.USER_VAULTS;
        this.userDestination = process.env.USER_VAULTS; // You might want to set this differently
    }

    setBuyAmount(amount) {
        this.buyAmount = amount;
    }

    setSellTargetPrice(percentage) {
        this.sellTargetPercentage = percentage;
        this.calculatedSellPrice = this.V * (1 + (percentage / 100));
    }

    async watchPrice() {
        console.log(`Watching price for target token: ${this.targetToken}`);
        console.log(`Initial price (V): ${this.V}`);
        console.log(`Target sell price (${this.sellTargetPercentage}% increase): ${this.calculatedSellPrice}`);

        const intervalId = setInterval(async () => {
            const currentPrice = await this.getCurrentPrice();
            console.log(`Current price of ${this.targetToken}: ${currentPrice}`);
            if (currentPrice >= this.calculatedSellPrice) {
                await this.sellToken();
                clearInterval(intervalId);
            }
        }, 60000);
    }

    async getCurrentPrice() {
        // Fetch the current liquidity pool balance from pcVault
        const currentBalance = await this.getLiquidityBalance(); // Replace with the actual logic
        return this.calculatePrice(currentBalance);
    }

    calculatePrice(currentBalance) {
        const X = this.K / currentBalance;
        const price = currentBalance / X;
        return price;
    }

    async getLiquidityBalance() {
        const solVault = new PublicKey(this.tokenData.solVault);
        const accountInfo = await this.connection.getAccountInfo(solVault);
        if (accountInfo) {
            const balance = accountInfo.lamports / 10 ** 9;
            return balance;
        }
        throw new Error(`Unable to fetch liquidity balance for solVault ${this.tokenData.solVault}`);
    }

    async buyToken() {
        try {
            console.log(`Initiating buy for ${this.buyAmount} of target token: ${this.targetToken}`);

            const swapResult = await swapTokens({
                tokenData: this.tokenData,
                userSource: this.userSource,
                userDestination: this.userDestination,
                amountSpecified: this.buyAmount,
                swapBaseIn: true // true for buying
            });

            console.log(`Buy transaction successful: ${swapResult}`);
            return swapResult;
        } catch (error) {
            console.error('Error in buyToken:', error);
            throw error;
        }
    }

    async sellToken() {
        try {
            console.log(`Selling target token: ${this.targetToken}`);
            console.log(`Target price reached: ${this.calculatedSellPrice} (${this.sellTargetPercentage}% increase from V)`);

            const swapResult = await swapTokens({
                tokenData: this.tokenData,
                userSource: this.userDestination, // For selling, source is where we received the tokens
                userDestination: this.userSource, // For selling, destination is our original source
                amountSpecified: this.buyAmount, // You might want to calculate the actual amount to sell
                swapBaseIn: false // false for selling
            });

            console.log(`Sell transaction successful: ${swapResult}`);
            await this.unsubscribeFromVault();
            return swapResult;
        } catch (error) {
            console.error('Error in sellToken:', error);
            throw error;
        }
    }

    async subscribeToVault() {
        const solVault = new PublicKey(this.tokenData.solVault);
        this.vaultSubscriptionId = this.connection.onAccountChange(solVault, (accountInfo) => {
            const balance = accountInfo.lamports / 10 ** 9;
            console.log(`Updated balance for solVault ${this.tokenData.solVault}: ${balance}`);
            const price = this.calculatePrice(balance);
            console.log(`Calculated price based on updated balance: ${price}`);

            if (price >= this.calculatedSellPrice) {
                this.sellToken()
                    .then(() => this.unsubscribeFromVault())
                    .catch(error => console.error('Error during sale:', error));
            }
        });
        console.log(`Subscribed to account changes for solVault ${this.tokenData.solVault}`);
    }

    async unsubscribeFromVault() {
        if (this.vaultSubscriptionId) {
            try {
                await this.connection.removeAccountChangeListener(this.vaultSubscriptionId);
                console.log(`Unsubscribed from vault ${this.tokenData.solVault}`);
                this.vaultSubscriptionId = null;
            } catch (error) {
                console.error('Error unsubscribing from vault:', error);
            }
        }
    }
}

module.exports = Sniper;