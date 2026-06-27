const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploy MultiSigWallet and write the address + ABI to the frontend.
 *
 * Configuration is read from environment variables so the same script
 * works on localhost, Sepolia, and mainnet.
 *
 * Environment variables:
 *   OWNERS        – comma-separated owner addresses (defaults to first 3 Hardhat signers)
 *   REQUIRED      – approval threshold (defaults to 2)
 */
async function main() {
  const [deployer, signer2, signer3] = await ethers.getSigners();

  console.log("─".repeat(60));
  console.log("  MultiSigWallet Deployment");
  console.log("─".repeat(60));
  console.log(`  Deployer : ${deployer.address}`);
  console.log(
    `  Balance  : ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address)
    )} ETH`
  );

  // ── Owner list ────────────────────────────────────────────────────────────
  let owners;
  if (process.env.OWNERS) {
    owners = process.env.OWNERS.split(",").map((a) => a.trim());
  } else {
    // Localhost default: first 3 Hardhat accounts
    owners = [deployer.address, signer2.address, signer3.address];
  }

  const required = process.env.REQUIRED ? Number(process.env.REQUIRED) : 2;

  console.log(`\n  Owners   :`);
  owners.forEach((o, i) => console.log(`    [${i}] ${o}`));
  console.log(`  Required : ${required}`);

  // ── Deploy ────────────────────────────────────────────────────────────────
  const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
  const wallet = await MultiSigWallet.deploy(owners, required);
  await wallet.waitForDeployment();

  const address = await wallet.getAddress();
  console.log(`\n  ✓ Deployed at: ${address}`);

  // ── Write deployment info to frontend ────────────────────────────────────
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/MultiSigWallet.sol/MultiSigWallet.json"
  );

  const frontendDir = path.join(__dirname, "../frontend/src/abi");
  if (!fs.existsSync(frontendDir)) fs.mkdirSync(frontendDir, { recursive: true });

  // Write ABI
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(
    path.join(frontendDir, "MultiSigWallet.json"),
    JSON.stringify({ abi: artifact.abi }, null, 2)
  );

  // Write deployment addresses per network
  const deploymentFile = path.join(frontendDir, "deployments.json");
  let deployments = {};
  if (fs.existsSync(deploymentFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  }

  const network = await ethers.provider.getNetwork();
  deployments[network.chainId.toString()] = {
    address,
    owners,
    required,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deployments, null, 2));

  console.log("  ✓ ABI and deployment info written to frontend/src/abi/");
  console.log("─".repeat(60));

  // ── Verification hint ─────────────────────────────────────────────────────
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n  To verify on Etherscan run:");
    console.log(
      `  npx hardhat verify --network ${network.name} ${address} \\`
    );
    console.log(`    '["${owners.join('","')}"]' ${required}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
