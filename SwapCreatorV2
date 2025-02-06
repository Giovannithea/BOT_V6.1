const { Connection, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram, Keypair, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require("@solana/spl-token");
const bs58 = require('bs58');
require("dotenv").config();

const connection = new Connection(process.env.SOLANA_WS_URL, "confirmed");

async function createSwapInstruction({
                                         tokenData,
                                         userOwnerPublicKey,
                                         userSource,
                                         userDestination,
                                         amountSpecified,
                                         swapBaseIn
                                     }) {
    // Validate required fields
    const requiredFields = [
        'ammId', 'ammAuthority', 'ammOpenOrders', 'tokenVault', 'solVault',
        'marketProgramId', 'marketId', 'marketBids', 'marketAsks', 'marketEventQueue',
        'marketBaseVault', 'marketQuoteVault', 'marketAuthority'
    ];

    requiredFields.forEach(field => {
        if (!tokenData[field]) throw new Error(`Missing required field: ${field}`);
        new PublicKey(tokenData[field]); // Validate all addresses
    });

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
        { pubkey: userOwnerPublicKey, isSigner: true, isWritable: false },
    ];

    const dataLayout = Buffer.alloc(9);
    dataLayout.writeUInt8(swapBaseIn ? 9 : 10, 0);
    dataLayout.writeBigUInt64LE(BigInt(amountSpecified), 1);

    return new TransactionInstruction({
        keys,
        programId: new PublicKey(tokenData.programId),
        data: dataLayout
    });
}

async function swapTokens({
                              tokenData,
                              userSource,
                              userDestination,
                              amountSpecified,
                              swapBaseIn
                          }) {
    try {
        const userOwner = Keypair.fromSecretKey(
            bs58.default.decode(process.env.WALLET_PRIVATE_KEY)
        );
        const userOwnerPublicKey = userOwner.publicKey;

        // Validate token data exists
        if (!tokenData?.tokenAddress) {
            throw new Error("Invalid token data - missing token address");
        }

        // Convert amount to lamports with decimals consideration
        const decimals = tokenData.decimals || 9; // Default to SOL decimals
        const rawAmount = Math.floor(amountSpecified * 10 ** decimals);

        // Validate SOL balance
        const walletBalance = await connection.getBalance(userOwnerPublicKey);
        const requiredBalance = 0.05 * 1e9; // 0.05 SOL buffer

        if (walletBalance < requiredBalance) {
            throw new Error(`Insufficient SOL balance. Required: ${requiredBalance/1e9} SOL, Current: ${walletBalance/1e9} SOL`);
        }

        console.log('Starting swap with parameters:', {
            amount: amountSpecified,
            rawAmount,
            decimals,
            swapBaseIn,
            source: userSource,
            destination: userDestination
        });

        const swapIx = await createSwapInstruction({
            tokenData,
            userOwnerPublicKey,
            userSource,
            userDestination,
            amountSpecified: rawAmount,
            swapBaseIn
        });

        const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 });
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 });

        const transaction = new Transaction()
            .add(computeLimitIx)
            .add(priorityFeeIx)
            .add(swapIx);

        transaction.feePayer = userOwnerPublicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const signature = await connection.sendTransaction(transaction, [userOwner]);
        await connection.confirmTransaction(signature);

        console.log('Swap successful:', signature);
        return signature;

    } catch (error) {
        console.error('Swap failed:', {
            message: error.message,
            token: tokenData?.tokenAddress,
            amount: amountSpecified
        });
        throw error;
    }
}

module.exports = {
    swapTokens
};
