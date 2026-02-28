# Fix Insufficient Lamports Error and Swap Instructions Error During Unshield+Swap

This PR fixes three issues:

1. The insufficient lamports error that occurs when attempting to swap with unshielded funds by:
   - Adding a buffer of 0.005 SOL (5,000,000 lamports) for transaction costs
   - Removing the unshielding fee when unshielding during a swap
   - Implementing two separate transactions (unshield first, then swap)

2. The "n.getCompressedAccountsByOwner is not a function" error by:
   - Using `createRpc` from '@lightprotocol/stateless.js' to create a connection
   - Following the same pattern as the `checkPrivateBalance` function in utils.ts

3. The "Cannot read properties of undefined (reading 'length')" error by:
   - Adding proper null checks before accessing `swapInstructionsResponse.instructions` properties
   - Adding defensive programming to validate API responses
   - Improving error handling to provide more meaningful error messages
   - Adding skipPreflight option for autoconfirmation of trading wallet transactions

## Changes

- Added a `MIN_BUFFER_LAMPORTS` constant (5,000,000 lamports = 0.005 SOL)
- Implemented a two-transaction approach similar to the private transfer code:
  1. First transaction: Unshield the needed amount with buffer
  2. Second transaction: Execute the swap with unshielded funds immediately after unshielding completes
- Removed the unshielding fee during swap operations
- Simplified error handling to show a message to try again if it fails
- Added detailed logging throughout the process for diagnostic purposes

## Implementation Approach

The implementation follows the pattern from the private transfer code:
- Checks if public balance is sufficient for the swap
- If not, calculates the exact amount needed to unshield from private balance
- Adds a small buffer (0.005 SOL) to account for transaction costs
- Unshields the funds with zero fees
- Waits for balance update confirmation
- Proceeds with the swap transaction immediately after unshielding completes

## Testing

The implementation has been tested with the following scenarios:
- Public balance is sufficient for swap (no unshielding needed)
- Public balance is insufficient, but combined with private balance is sufficient
- Combined balance is insufficient for swap (shows error)

Link to Devin run: https://app.devin.ai/sessions/49975575d6fa4a1dadff01fa2dd5c214
Requested by: Arjun
