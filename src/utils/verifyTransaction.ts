import axios from 'axios';

const BASESCAN_API_KEY =  'BKJBIPAMJXASHTS9TAV1T5MNI6CV1BWUZT';
const RECEIVER_ADDRESS = '0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670'.toLowerCase();
const REQUIRED_USD = 2; // $2 USD

export async function verifyTransaction(txHash: string): Promise<boolean> {
    try {
        // 1. Get basic transaction info
        const txRes = await axios.get(`https://api.etherscan.io/api`, {
            params: {
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: txHash,
                apikey: BASESCAN_API_KEY
            }
        });

        const tx = txRes.data.result;
        if (!tx) throw new Error('Transaction not found');

        const toAddress = tx.to?.toLowerCase();
        const valueEth = parseInt(tx.value, 16) / 1e18;

        // 2. If ETH/MATIC sent directly
        if (toAddress === RECEIVER_ADDRESS && valueEth > 0) {
            const ethUsd = await getEthUsdPrice();
            const usdSent = valueEth * ethUsd;
            return usdSent >= REQUIRED_USD;
        }

        // 3. Otherwise check token transfers
        const receiptRes = await axios.get(`https://api.etherscan.io/api`, {
            params: {
                module: 'account',
                action: 'tokentx',
                txhash: txHash,
                apikey: BASESCAN_API_KEY
            }
        });

        const tokenTransfers = receiptRes.data.result;
        for (const transfer of tokenTransfers) {
            const to = transfer.to?.toLowerCase();
            const amount = parseFloat(transfer.value) / Math.pow(10, transfer.tokenDecimal);
            if (to === RECEIVER_ADDRESS) {
                const usdValue = await getTokenUsdPrice(transfer.contractAddress);
                if (amount * usdValue >= REQUIRED_USD) {
                    return true;
                }
            }
        }

        console.warn('Transaction found but no valid payment detected');
        return false;

    } catch (error) {
        if (error instanceof Error) {
            console.error('Verification error:', error.message);
        } else {
            console.error('Verification error:', error);
        }

        return false;
    }
}

async function getEthUsdPrice(): Promise<number> {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
            ids: 'ethereum',
            vs_currencies: 'usd'
        }
    });
    return res.data.ethereum.usd;
}

async function getTokenUsdPrice(contractAddress: string): Promise<number> {
    // This is basic. For production use a cache or a more robust price feed.
    const res = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/ethereum`, {
        params: {
            contract_addresses: contractAddress,
            vs_currencies: 'usd'
        }
    });
    return res.data[contractAddress.toLowerCase()]?.usd || 0;
}
