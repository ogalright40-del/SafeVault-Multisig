import React, { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { shortAddress, networkName, formatEth } from "./utils/format";
import Header from "./components/Header";
import WalletInfo from "./components/WalletInfo";
import SubmitForm from "./components/SubmitForm";
import TransactionTable from "./components/TransactionTable";
import Toast from "./components/Toast";
import "./styles.css";

export default function App() {
  const wallet = useWallet();
  const [activeTab, setActiveTab] = useState("pending");

  const pending = wallet.transactions.filter((tx) => !tx.executed);
  const executed = wallet.transactions.filter((tx) => tx.executed);

  return (
    <div className="app">
      <Header
        account={wallet.account}
        chainId={wallet.chainId}
        balance={wallet.balance}
        onConnect={wallet.connectWallet}
        loading={wallet.loading}
      />

      {wallet.toast && <Toast toast={wallet.toast} />}

      {!wallet.account ? (
        <div className="connect-screen">
          <div className="connect-card">
            <div className="vault-icon">🔐</div>
            <h1>MultiSig Vault</h1>
            <p>
              A production-grade multi-signature wallet. Every transaction
              requires M-of-N owner approvals before execution.
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={wallet.connectWallet}
              disabled={wallet.loading}
            >
              {wallet.loading ? "Connecting…" : "Connect MetaMask"}
            </button>
          </div>
        </div>
      ) : (
        <main className="main">
          {/* Wallet Info Panel */}
          <WalletInfo
            owners={wallet.owners}
            required={wallet.required}
            balance={wallet.balance}
            account={wallet.account}
            isOwner={wallet.isOwner}
          />

          {/* Submit Transaction */}
          {wallet.isOwner && (
            <SubmitForm
              onSubmit={wallet.submitTransaction}
              loading={wallet.loading}
            />
          )}

          {/* Transaction Tables */}
          <section className="card">
            <div className="tabs">
              <button
                className={`tab ${activeTab === "pending" ? "tab--active" : ""}`}
                onClick={() => setActiveTab("pending")}
              >
                Pending
                {pending.length > 0 && (
                  <span className="badge">{pending.length}</span>
                )}
              </button>
              <button
                className={`tab ${activeTab === "history" ? "tab--active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                History
                {executed.length > 0 && (
                  <span className="badge badge--gray">{executed.length}</span>
                )}
              </button>
            </div>

            <TransactionTable
              transactions={activeTab === "pending" ? pending : executed}
              required={wallet.required}
              isOwner={wallet.isOwner}
              approvals={wallet.approvals}
              onApprove={wallet.approveTransaction}
              onRevoke={wallet.revokeApproval}
              onExecute={wallet.executeTransaction}
              loading={wallet.loading}
              isPending={activeTab === "pending"}
            />
          </section>
        </main>
      )}
    </div>
  );
}
