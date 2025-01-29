const Sniper = require('./Sniper');
require('dotenv').config(); // Load environment variables

class SniperManager {
    constructor() {
        this.snipers = [];
    }

    async addSniper(config) {
        let sniper = null; // Define sniper variable first
        try {
            sniper = new Sniper(config);
            this.snipers.push(sniper);
            console.log('Sniper added for token:', config.targetToken);

            // Buy token and start monitoring
            const buyResult = await sniper.buyToken();
            console.log('Initial buy completed:', buyResult);

            // Start price monitoring
            await sniper.subscribeToVault();
            console.log('Price monitoring started');

            sniper.watchPrice().catch(err => {
                console.error('Error in price watching:', err);
            });

        } catch (error) {
            console.error('Error in sniper setup:', error);
            // Now sniper is defined in this scope
            if (sniper && this.snipers.includes(sniper)) {
                const index = this.snipers.indexOf(sniper);
                this.snipers.splice(index, 1);
            }
        }
    }

    setBuyAmount(index, amount) {
        if (this.snipers[index]) {
            this.snipers[index].setBuyAmount(amount);
            console.log(`Buy amount set to ${amount} for sniper at index ${index}`);
        } else {
            console.error('Sniper not found at index:', index);
        }
    }

    setSellTargetPrice(index, price) {
        if (this.snipers[index]) {
            this.snipers[index].setSellTargetPrice(price);
            console.log(`Sell target price set to ${price} for sniper at index ${index}`);
        } else {
            console.error('Sniper not found at index:', index);
        }
    }

    async init() {
        console.log('Sniper Manager initialized');
    }
}

module.exports = new SniperManager();