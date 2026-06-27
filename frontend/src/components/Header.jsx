import React from "react";
import { shortAddress, networkName, formatEth } from "../utils/format";

export default function Header({ account, chainId, balance, onConnect, loading }) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">🔐</span>
        <span className="header__title">MultiSig Vault</span>
      </div>

      <div className="header__right">
        {account ? (
          <>
            <div className="header__network">
              <span className="status-dot status-dot--green" />
              {networkName(chainId)}
            </div>
            <div className="header__balance">
              <span className="label">Vault</span>
              <span className="mono">{formatEth(balance)} ETH</span>
            </div>
            <div className="header__account">
              <span className="mono">{shortAddress(account)}</span>
            </div>
          </>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onConnect}
            disabled={loading}
          >
            {loading ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
