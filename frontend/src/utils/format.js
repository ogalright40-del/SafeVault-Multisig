/**
 * Format an Ethereum address for display: 0x1234...abcd
 */
export function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Return a human-readable network name from chainId.
 */
export function networkName(chainId) {
  const names = {
    1: "Ethereum Mainnet",
    11155111: "Sepolia Testnet",
    31337: "Hardhat Local",
    5: "Goerli Testnet",
  };
  return names[chainId] || `Chain ${chainId}`;
}

/**
 * Truncate call data for display.
 */
export function shortData(data) {
  if (!data || data === "0x") return "—";
  if (data.length <= 10) return data;
  return `${data.slice(0, 10)}…`;
}

/**
 * Format ETH value with up to 6 decimal places, trailing zeros removed.
 */
export function formatEth(value) {
  const n = parseFloat(value);
  if (n === 0) return "0";
  return n.toFixed(6).replace(/\.?0+$/, "");
}
