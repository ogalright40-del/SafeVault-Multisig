const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─────────────────────────────────────────────────────────────────────────────
//  Test Suite: MultiSigWallet
// ─────────────────────────────────────────────────────────────────────────────

describe("MultiSigWallet", function () {
  // ── Fixture ───────────────────────────────────────────────────────────────

  /**
   * Deploy a fresh wallet with 3 owners and threshold = 2.
   * loadFixture snapshots the chain state and reverts to it before each test,
   * so tests are fully isolated without re-deploying.
   */
  async function deployWalletFixture() {
    const [owner1, owner2, owner3, nonOwner] = await ethers.getSigners();

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    const wallet = await MultiSigWallet.deploy(
      [owner1.address, owner2.address, owner3.address],
      2
    );
    await wallet.waitForDeployment();

    return { wallet, owner1, owner2, owner3, nonOwner };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets owners correctly", async function () {
      const { wallet, owner1, owner2, owner3 } = await loadFixture(deployWalletFixture);
      const owners = await wallet.getOwners();
      expect(owners).to.deep.equal([owner1.address, owner2.address, owner3.address]);
    });

    it("sets required correctly", async function () {
      const { wallet } = await loadFixture(deployWalletFixture);
      expect(await wallet.required()).to.equal(2);
    });

    it("marks all addresses as owners", async function () {
      const { wallet, owner1, owner2, owner3 } = await loadFixture(deployWalletFixture);
      expect(await wallet.isOwner(owner1.address)).to.be.true;
      expect(await wallet.isOwner(owner2.address)).to.be.true;
      expect(await wallet.isOwner(owner3.address)).to.be.true;
    });

    it("reverts with no owners", async function () {
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      await expect(MultiSigWallet.deploy([], 0)).to.be.revertedWith(
        "MultiSigWallet: owners required"
      );
    });

    it("reverts with required = 0", async function () {
      const [a, b] = await ethers.getSigners();
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      await expect(
        MultiSigWallet.deploy([a.address, b.address], 0)
      ).to.be.revertedWith("MultiSigWallet: invalid required count");
    });

    it("reverts when required > owners", async function () {
      const [a, b] = await ethers.getSigners();
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      await expect(
        MultiSigWallet.deploy([a.address, b.address], 3)
      ).to.be.revertedWith("MultiSigWallet: invalid required count");
    });

    it("reverts with duplicate owners", async function () {
      const [a] = await ethers.getSigners();
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      await expect(
        MultiSigWallet.deploy([a.address, a.address], 1)
      ).to.be.revertedWith("MultiSigWallet: duplicate owner");
    });

    it("reverts with zero address owner", async function () {
      const [a] = await ethers.getSigners();
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      await expect(
        MultiSigWallet.deploy([a.address, ethers.ZeroAddress], 1)
      ).to.be.revertedWith("MultiSigWallet: zero address owner");
    });

    it("reverts with more than 50 owners", async function () {
      const signers = await ethers.getSigners();
      // Generate 51 unique addresses
      const addrs = Array.from({ length: 51 }, (_, i) =>
        ethers.Wallet.createRandom().address
      );
      const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
      await expect(MultiSigWallet.deploy(addrs, 1)).to.be.revertedWith(
        "MultiSigWallet: too many owners"
      );
    });
  });

  // ── Deposit ───────────────────────────────────────────────────────────────

  describe("Deposit", function () {
    it("accepts ETH and emits Deposit event", async function () {
      const { wallet, owner1 } = await loadFixture(deployWalletFixture);
      const amount = ethers.parseEther("1.0");

      await expect(
        owner1.sendTransaction({ to: await wallet.getAddress(), value: amount })
      )
        .to.emit(wallet, "Deposit")
        .withArgs(owner1.address, amount, amount);
    });

    it("updates balance after deposit", async function () {
      const { wallet, owner1 } = await loadFixture(deployWalletFixture);
      const amount = ethers.parseEther("2.0");
      await owner1.sendTransaction({ to: await wallet.getAddress(), value: amount });
      expect(await wallet.getBalance()).to.equal(amount);
    });
  });

  // ── Submit Transaction ────────────────────────────────────────────────────

  describe("submitTransaction", function () {
    it("owner can submit a transaction", async function () {
      const { wallet, owner1, nonOwner } = await loadFixture(deployWalletFixture);

      await expect(
        wallet
          .connect(owner1)
          .submitTransaction(nonOwner.address, ethers.parseEther("0.1"), "0x")
      )
        .to.emit(wallet, "SubmitTransaction")
        .withArgs(owner1.address, 0, nonOwner.address, ethers.parseEther("0.1"), "0x");

      expect(await wallet.getTransactionCount()).to.equal(1);
    });

    it("non-owner cannot submit", async function () {
      const { wallet, nonOwner } = await loadFixture(deployWalletFixture);
      await expect(
        wallet
          .connect(nonOwner)
          .submitTransaction(nonOwner.address, 0, "0x")
      ).to.be.revertedWith("MultiSigWallet: not owner");
    });

    it("reverts when destination is zero address", async function () {
      const { wallet, owner1 } = await loadFixture(deployWalletFixture);
      await expect(
        wallet.connect(owner1).submitTransaction(ethers.ZeroAddress, 0, "0x")
      ).to.be.revertedWith("MultiSigWallet: invalid destination");
    });

    it("stores transaction data correctly", async function () {
      const { wallet, owner1, nonOwner } = await loadFixture(deployWalletFixture);
      const value = ethers.parseEther("0.5");
      const data = "0xdeadbeef";

      await wallet.connect(owner1).submitTransaction(nonOwner.address, value, data);

      const tx = await wallet.getTransaction(0);
      expect(tx.to).to.equal(nonOwner.address);
      expect(tx.value).to.equal(value);
      expect(tx.data).to.equal(data);
      expect(tx.executed).to.be.false;
      expect(tx.numApprovals).to.equal(0);
    });
  });

  // ── Approve Transaction ───────────────────────────────────────────────────

  describe("approveTransaction", function () {
    async function withPendingTx() {
      const fixture = await loadFixture(deployWalletFixture);
      const { wallet, owner1, nonOwner } = fixture;
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, ethers.parseEther("0.1"), "0x");
      return fixture;
    }

    it("owner can approve a pending transaction", async function () {
      const { wallet, owner1 } = await withPendingTx();
      await expect(wallet.connect(owner1).approveTransaction(0))
        .to.emit(wallet, "ApproveTransaction")
        .withArgs(owner1.address, 0);

      expect((await wallet.getTransaction(0)).numApprovals).to.equal(1);
      expect(await wallet.hasApproved(0, owner1.address)).to.be.true;
    });

    it("non-owner cannot approve", async function () {
      const { wallet, nonOwner } = await withPendingTx();
      await expect(
        wallet.connect(nonOwner).approveTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: not owner");
    });

    it("cannot double-approve", async function () {
      const { wallet, owner1 } = await withPendingTx();
      await wallet.connect(owner1).approveTransaction(0);
      await expect(
        wallet.connect(owner1).approveTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: tx already approved");
    });

    it("reverts for non-existent transaction", async function () {
      const { wallet, owner1 } = await withPendingTx();
      await expect(
        wallet.connect(owner1).approveTransaction(99)
      ).to.be.revertedWith("MultiSigWallet: tx does not exist");
    });
  });

  // ── Revoke Approval ───────────────────────────────────────────────────────

  describe("revokeApproval", function () {
    it("owner can revoke their approval", async function () {
      const { wallet, owner1, nonOwner } = await loadFixture(deployWalletFixture);
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, 0, "0x");
      await wallet.connect(owner1).approveTransaction(0);

      await expect(wallet.connect(owner1).revokeApproval(0))
        .to.emit(wallet, "RevokeApproval")
        .withArgs(owner1.address, 0);

      expect((await wallet.getTransaction(0)).numApprovals).to.equal(0);
      expect(await wallet.hasApproved(0, owner1.address)).to.be.false;
    });

    it("reverts if not previously approved", async function () {
      const { wallet, owner1, owner2, nonOwner } = await loadFixture(
        deployWalletFixture
      );
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, 0, "0x");

      await expect(
        wallet.connect(owner2).revokeApproval(0)
      ).to.be.revertedWith("MultiSigWallet: not approved");
    });
  });

  // ── Execute Transaction ───────────────────────────────────────────────────

  describe("executeTransaction", function () {
    async function setupApprovedTx() {
      const fixture = await loadFixture(deployWalletFixture);
      const { wallet, owner1, owner2, owner3, nonOwner } = fixture;
      const walletAddr = await wallet.getAddress();

      // Fund the wallet
      await owner1.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther("2.0"),
      });

      // Submit + 2 approvals (meets threshold)
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, ethers.parseEther("1.0"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);

      return fixture;
    }

    it("executes when threshold is met", async function () {
      const { wallet, owner1, nonOwner } = await setupApprovedTx();

      const balanceBefore = await ethers.provider.getBalance(nonOwner.address);

      await expect(wallet.connect(owner1).executeTransaction(0))
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner1.address, 0);

      const balanceAfter = await ethers.provider.getBalance(nonOwner.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1.0"));
      expect((await wallet.getTransaction(0)).executed).to.be.true;
    });

    it("reverts when below threshold", async function () {
      const { wallet, owner1, nonOwner } = await loadFixture(deployWalletFixture);
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, ethers.parseEther("0.1"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
      // Only 1 approval; required = 2

      await expect(
        wallet.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: insufficient approvals");
    });

    it("cannot execute twice", async function () {
      const { wallet, owner1 } = await setupApprovedTx();
      await wallet.connect(owner1).executeTransaction(0);
      await expect(
        wallet.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: tx already executed");
    });

    it("non-owner cannot execute", async function () {
      const { wallet, nonOwner } = await setupApprovedTx();
      await expect(
        wallet.connect(nonOwner).executeTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: not owner");
    });

    it("reverts when wallet lacks funds", async function () {
      const { wallet, owner1, owner2, nonOwner } = await loadFixture(
        deployWalletFixture
      );
      // No ETH funded
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, ethers.parseEther("1.0"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);

      await expect(
        wallet.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: tx execution failed");
    });
  });

  // ── Full Happy-Path Flow ──────────────────────────────────────────────────

  describe("Full happy-path flow", function () {
    it("submit → approve × 2 → execute transfers ETH correctly", async function () {
      const { wallet, owner1, owner2, owner3, nonOwner } = await loadFixture(
        deployWalletFixture
      );
      const walletAddr = await wallet.getAddress();
      const transferAmount = ethers.parseEther("0.5");

      // Fund
      await owner1.sendTransaction({ to: walletAddr, value: ethers.parseEther("1.0") });

      // Submit
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, transferAmount, "0x");

      // 2 distinct owners approve
      await wallet.connect(owner2).approveTransaction(0);
      await wallet.connect(owner3).approveTransaction(0);

      // Execute
      const before = await ethers.provider.getBalance(nonOwner.address);
      await wallet.connect(owner1).executeTransaction(0);
      const after = await ethers.provider.getBalance(nonOwner.address);

      expect(after - before).to.equal(transferAmount);
      expect(await wallet.getBalance()).to.equal(ethers.parseEther("0.5"));
    });
  });

  // ── Security Tests ────────────────────────────────────────────────────────

  describe("Security", function () {
    it("revoke prevents execution below threshold", async function () {
      const { wallet, owner1, owner2, nonOwner } = await loadFixture(
        deployWalletFixture
      );
      const walletAddr = await wallet.getAddress();
      await owner1.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther("1.0"),
      });
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, ethers.parseEther("0.5"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);

      // Owner 2 changes mind
      await wallet.connect(owner2).revokeApproval(0);

      await expect(
        wallet.connect(owner1).executeTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: insufficient approvals");
    });

    it("cannot approve an already-executed transaction", async function () {
      const { wallet, owner1, owner2, owner3, nonOwner } = await loadFixture(
        deployWalletFixture
      );
      const walletAddr = await wallet.getAddress();
      await owner1.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther("1.0"),
      });
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, ethers.parseEther("0.5"), "0x");
      await wallet.connect(owner1).approveTransaction(0);
      await wallet.connect(owner2).approveTransaction(0);
      await wallet.connect(owner1).executeTransaction(0);

      await expect(
        wallet.connect(owner3).approveTransaction(0)
      ).to.be.revertedWith("MultiSigWallet: tx already executed");
    });

    it("handles contract interaction (call data) correctly", async function () {
      // Deploy a simple counter contract inline via raw bytecode isn't ideal;
      // instead we verify that data is stored and emitted.
      const { wallet, owner1, owner2, nonOwner } = await loadFixture(
        deployWalletFixture
      );
      const callData = "0x12345678";
      await wallet
        .connect(owner1)
        .submitTransaction(nonOwner.address, 0, callData);

      const tx = await wallet.getTransaction(0);
      expect(tx.data).to.equal(callData);
    });

    it("pagination getTransactions works correctly", async function () {
      const { wallet, owner1, nonOwner } = await loadFixture(deployWalletFixture);

      // Submit 5 transactions
      for (let i = 0; i < 5; i++) {
        await wallet
          .connect(owner1)
          .submitTransaction(nonOwner.address, i, "0x");
      }

      const page = await wallet.getTransactions(1, 3);
      expect(page.length).to.equal(2);
      expect(page[0].value).to.equal(1n);
      expect(page[1].value).to.equal(2n);
    });
  });
});
