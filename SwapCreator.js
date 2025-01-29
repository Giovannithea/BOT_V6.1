const { Connection, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, Keypair } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const bs58 = require('bs58');
require("dotenv").config();

const connection = new Connection(process.env.SOLANA_WS_URL, "confirmed");
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey(process.env.RAYDIUM_AMM_PROGRAM_ID);

async function checkTokenBalance(tokenAccount) {
    try {
        const balance = await connection.getTokenAccountBalance(new PublicKey(tokenAccount));
        return {
            amount: Number(balance.value.amount),
            decimals: balance.value.decimals
        };
    } catch (error) {
        console.error('Error checking token balance:', error);
        throw new Error('Failed to check token balance');
    }
}

async function createSwapInstruction({
                                         tokenData,
                                         userOwner,
                                         userSource,
                                         userDestination,
                                         amountSpecified,
                                         swapBaseIn
                                     }) {
    const keys = [
        { pubkey: new PublicKey(tokenData.ammId), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.ammAuthority), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(tokenData.ammOpenOrders), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.tokenVault), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.solVault), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketProgramId), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(tokenData.marketId), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketBids), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketAsks), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketEventQueue), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketBaseVault), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketQuoteVault), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(tokenData.marketAuthority), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(userSource), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(userDestination), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(userOwner), isSigner: true, isWritable: false },
    ];

    const dataLayout = Buffer.alloc(9);
    dataLayout.writeUInt8(swapBaseIn ? 9 : 10, 0);
    dataLayout.writeBigUInt64LE(BigInt(amountSpecified), 1);

    return new TransactionInstruction({
        keys,
        programId: RAYDIUM_AMM_PROGRAM_ID,
        data: dataLayout
    });
}

async function getPriorityFee(accounts) {
    try {
        const recentPrioritizationFees = await connection.getRecentPrioritizationFees({
            lockedWritableAccounts: accounts
        });

        if (recentPrioritizationFees.length > 0) {
            // Get the most recent fee
            const recentFee = recentPrioritizationFees[recentPrioritizationFees.length - 1].prioritizationFee;
            // Add 30% to the fee
            const adjustedFee = recentFee + Math.floor(recentFee * 0.3);
            return adjustedFee;
        }

        // Default fee if no recent fees available
        return 1000;
    } catch (error) {
        console.error('Error getting priority fee:', error);
        return 1000; // Default fallback fee
    }
}

async function swapTokens({
                              tokenData,
                              userSource,
                              userDestination,
                              amountSpecified,
                              swapBaseIn
                          }) {
    try {
        // Debug log to see what we're receiving
        console.log('Received token data:', {
            tokenData,
            userSource,
            userDestination
        });

        // Check if addresses are in correct Base58 format
        function isValidBase58Address(address) {
            try {
                new PublicKey(address);
                return true;
            } catch (e) {
                console.error(`Invalid address format: ${address}`);
                return false;
            }
        }

        // Validate address
        if (!isValidBase58Address(tokenData.ammId)) {
            throw new Error(`Invalid ammId address: ${tokenData.ammId}`);
        }

        const userOwner = Keypair.fromSecretKey(
            bs58.default.decode(process.env.WALLET_PRIVATE_KEY)
        );

        // Check SOL balance
        const walletBalance = await connection.getBalance(userOwner.publicKey);
        const requiredBalance = (parseFloat(process.env.BUY_AMOUNT) + 0.01) * 1e9; // Convert to lamports

        if (walletBalance < requiredBalance) {
            throw new Error(`Insufficient SOL balance. Required: ${requiredBalance/1e9} SOL, Current: ${walletBalance/1e9} SOL`);
        }

        const balance = {
            amount: walletBalance,
            decimals: 9
        };

        console.log('Starting swap with parameters:', {
            amountSpecified: amountSpecified / (10 ** balance.decimals),
            requiredBalance: requiredBalance / 1e9,
            currentBalance: walletBalance / 1e9,
            swapBaseIn,
            sourceAccount: userSource,
            destinationAccount: userDestination
        });

        const swapIx = await createSwapInstruction({
            tokenData,
            userOwner,
            userSource,
            userDestination,
            amountSpecified,
            swapBaseIn
        });

        const accountKeys = swapIx.keys.map(key => key.pubkey);

        const priorityFee = await getPriorityFee(accountKeys);

        const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
            units: 100000
        });

        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        });

        const transaction = new Transaction()
            .add(computeLimitIx)
            .add(priorityFeeIx)
            .add(swapIx);

        transaction.feePayer = userOwner.publicKey;

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        console.log('Sending transaction with priority fee:', priorityFee);
        const signature = await connection.sendTransaction(transaction, [userOwner]);

        console.log('Awaiting confirmation...');
        const confirmation = await connection.confirmTransaction(signature);

        console.log('Swap transaction successful:', signature);
        return signature;

    } catch (error) {
        console.error('Detailed error in swapTokens:', {
            message: error.message,
            receivedData: {
                ammId: tokenData?.ammId,
                userSource,
                userDestination
            }
        });
        throw error;
    }
}

module.exports = {
    swapTokens,
    checkTokenBalance
};
