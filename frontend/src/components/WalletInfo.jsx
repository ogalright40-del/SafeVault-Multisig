import React from "react";
import { shortAddress, formatEth } from "../utils/format";

export default function WalletInfo({ owners, required, balance, account, isOwner }) {
  return (
    <section className="wallet-info">
      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card__label">Vault Balance</div>
          <div className="stat-card__value mono">{formatEth(balance)} ETH</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Approval Threshold</div>
          <div className="stat-card__value">
            {required} / {owners.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Total Owners</div>
          <div className="stat-card__value">{owners.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Your Role</div>
          <div className="stat-card__value">
            {isOwner ? (
              <span className="badge badge--green">Owner</span>
            ) : (
              <span className="badge badge--gray">Observer</span>
            )}
          </div>
        </div>
      </div>

      {/* Owners list */}
      <div className="card owners-card">
        <h3 className="card__title">Owners</h3>
        <div className="owners-list">
          {owners.map((owner, i) => (
            <div
              key={owner}
              className={`owner-item ${
                owner.toLowerCase() === account?.toLowerCase()
                  ? "owner-item--you"
                  : ""
              }`}
            >
              <span className="owner-item__index">{i + 1}</span>
              <span className="owner-item__address mono">{owner}</span>
              {owner.toLowerCase() === account?.toLowerCase() && (
                <span className="badge badge--blue">You</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
