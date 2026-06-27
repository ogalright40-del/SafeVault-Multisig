import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import MultiSigWalletABI from "../abi/MultiSigWallet.json";
import deployments from "../abi/deployments.json";

/**
 * useWallet – central hook for all blockchain interactions.
 *
 * Provides:
 *  - MetaMask connection state
 *  - Contract read/write helpers
 *  - Transaction list with live refresh
 *  - Toast notifications
 */
export function useWallet() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [owners, setOwners] = useState([]);
  const [required, setRequired] = useState(0);
  const [balance, setBalance] = useState("0");
  const [transactions, setTransactions] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [approvals, setApprovals] = useState({});

  // ── Toast helper ────────────────────────────────────────────────────────

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // ── Get contract address for current network ────────────────────────────

  const getContractAddress = useCallback((cId) => {
    const key = cId?.toString();
    if (deployments[key]?.address) return deployments[key].address;
    return null;
  }, []);

  // ── Load wallet data ────────────────────────────────────────────────────

  const loadWalletData = useCallback(
    async (contractInstance, signerAddress) => {
      try {
        const [ownersData, req, bal] = await Promise.all([
          contractInstance.getOwners(),
          contractInstance.required(),
          contractInstance.getBalance(),
        ]);

        setOwners(ownersData);
        setRequired(Number(req));
        setBalance(ethers.formatEther(bal));
        setIsOwner(
          ownersData.map((o) => o.toLowerCase()).includes(signerAddress.toLowerCase())
        );

        // Load transactions
        const count = await contractInstance.getTransactionCount();
        const txCount = Number(count);
        const txList = [];
        const approvalsMap = {};

        for (let i = 0; i < txCount; i++) {
          const tx = await contractInstance.getTransaction(i);
          // Check approval status for current user
          const hasApproved = await contractInstance.hasApproved(i, signerAddress);
          txList.push({
            index: i,
            to: tx.to,
            value: ethers.formatEther(tx.value),
            data: tx.data,
            executed: tx.executed,
            numApprovals: Number(tx.numApprovals),
          });
          approvalsMap[i] = hasApproved;
        }

        setTransactions(txList.reverse()); // Newest first
        setApprovals(approvalsMap);
      } catch (err) {
        console.error("Failed to load wallet data:", err);
        showToast("Failed to load wallet data", "error");
      }
    },
    [showToast]
  );

  // ── Connect MetaMask ────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      showToast("MetaMask not found. Please install it.", "error");
      return;
    }

    try {
      setLoading(true);
      const _provider = new ethers.BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);
      const _signer = await _provider.getSigner();
      const _account = await _signer.getAddress();
      const network = await _provider.getNetwork();
      const _chainId = Number(network.chainId);

      const address = getContractAddress(_chainId);
      if (!address) {
        showToast(
          `No deployment found for chain ${_chainId}. Deploy the contract first.`,
          "error"
        );
        return;
      }

      const _contract = new ethers.Contract(address, MultiSigWalletABI.abi, _signer);

      setProvider(_provider);
      setSigner(_signer);
      setContract(_contract);
      setAccount(_account);
      setChainId(_chainId);

      await loadWalletData(_contract, _account);
      showToast("Wallet connected!", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Connection failed", "error");
    } finally {
      setLoading(false);
    }
  }, [getContractAddress, loadWalletData, showToast]);

  // ── Refresh data ────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (contract && account) {
      await loadWalletData(contract, account);
    }
  }, [contract, account, loadWalletData]);

  // ── Submit Transaction ──────────────────────────────────────────────────

  const submitTransaction = useCallback(
    async (to, value, data = "0x") => {
      if (!contract) return;
      try {
        setLoading(true);
        const valueWei = ethers.parseEther(value || "0");
        const tx = await contract.submitTransaction(to, valueWei, data);
        showToast("Transaction submitted! Waiting for confirmation...", "info");
        await tx.wait();
        showToast("Transaction submitted successfully!", "success");
        await refresh();
      } catch (err) {
        showToast(err.reason || err.message || "Submit failed", "error");
      } finally {
        setLoading(false);
      }
    },
    [contract, refresh, showToast]
  );

  // ── Approve Transaction ─────────────────────────────────────────────────

  const approveTransaction = useCallback(
    async (txIndex) => {
      if (!contract) return;
      try {
        setLoading(true);
        const tx = await contract.approveTransaction(txIndex);
        showToast("Approving... Waiting for confirmation.", "info");
        await tx.wait();
        showToast("Transaction approved!", "success");
        await refresh();
      } catch (err) {
        showToast(err.reason || err.message || "Approval failed", "error");
      } finally {
        setLoading(false);
      }
    },
    [contract, refresh, showToast]
  );

  // ── Revoke Approval ─────────────────────────────────────────────────────

  const revokeApproval = useCallback(
    async (txIndex) => {
      if (!contract) return;
      try {
        setLoading(true);
        const tx = await contract.revokeApproval(txIndex);
        showToast("Revoking approval...", "info");
        await tx.wait();
        showToast("Approval revoked!", "success");
        await refresh();
      } catch (err) {
        showToast(err.reason || err.message || "Revoke failed", "error");
      } finally {
        setLoading(false);
      }
    },
    [contract, refresh, showToast]
  );

  // ── Execute Transaction ─────────────────────────────────────────────────

  const executeTransaction = useCallback(
    async (txIndex) => {
      if (!contract) return;
      try {
        setLoading(true);
        const tx = await contract.executeTransaction(txIndex);
        showToast("Executing transaction...", "info");
        await tx.wait();
        showToast("Transaction executed successfully!", "success");
        await refresh();
      } catch (err) {
        showToast(err.reason || err.message || "Execution failed", "error");
      } finally {
        setLoading(false);
      }
    },
    [contract, refresh, showToast]
  );

  // ── MetaMask event listeners ────────────────────────────────────────────

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setContract(null);
        showToast("Wallet disconnected", "info");
      } else {
        setAccount(accounts[0]);
        refresh();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [refresh, showToast]);

  // ── Contract event listeners ────────────────────────────────────────────

  useEffect(() => {
    if (!contract) return;

    const handleDeposit = () => refresh();
    const handleSubmit = () => refresh();
    const handleApprove = () => refresh();
    const handleRevoke = () => refresh();
    const handleExecute = () => refresh();

    contract.on("Deposit", handleDeposit);
    contract.on("SubmitTransaction", handleSubmit);
    contract.on("ApproveTransaction", handleApprove);
    contract.on("RevokeApproval", handleRevoke);
    contract.on("ExecuteTransaction", handleExecute);

    return () => {
      contract.off("Deposit", handleDeposit);
      contract.off("SubmitTransaction", handleSubmit);
      contract.off("ApproveTransaction", handleApprove);
      contract.off("RevokeApproval", handleRevoke);
      contract.off("ExecuteTransaction", handleExecute);
    };
  }, [contract, refresh]);

  return {
    account,
    chainId,
    owners,
    required,
    balance,
    transactions,
    isOwner,
    loading,
    toast,
    approvals,
    connectWallet,
    submitTransaction,
    approveTransaction,
    revokeApproval,
    executeTransaction,
    refresh,
  };
}
