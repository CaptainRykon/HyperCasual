// Place this in src/types/daimo-pay.d.ts or types/daimo-pay.d.ts

declare module '@daimo/pay' {
    export interface PaymentRequestParams {
        chainId: number;             // e.g. 8453 for Base Mainnet
        recipient: string;           // Wallet address
        amount: string;              // Amount in string format, e.g., "2.00"
        token: string;               // Token symbol or address (e.g., "USDC")
        onSuccess?: () => void;      // Called on successful payment
        onError?: (error: unknown) => void; // Called on failure (typed as unknown)
    }

    /**
     * Opens Farcaster Wallet with prefilled USDC payment request.
     */
    export function requestPayment(params: PaymentRequestParams): void;
}
