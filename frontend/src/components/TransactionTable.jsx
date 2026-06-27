import React from "react";
import { shortAddress, shortData, formatEth } from "../utils/format";

export default function TransactionTable({
  transactions,
  required,
  isOwner,
  approvals,
  onApprove,
  onRevoke,
  onExecute,
  loading,
  isPending,
}) {
  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">{isPending ? "📋" : "✅"}</div>
        <p>{isPending ? "No pending transactions" : "No executed transactions yet"}</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="tx-table">
        <thead>
          <tr>
            <th>#</th>
            <th>To</th>
            <th>Value</th>
            <th>Data</th>
            <th>Approvals</th>
            {isPending && isOwner && <th>Actions</th>}
            {!isPending && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const hasApproved = approvals[tx.index];
            const canExecute = tx.numApprovals >= required;

            return (
              <tr key={tx.index} className={tx.executed ? "row--executed" : ""}>
                <td className="mono tx-index">{tx.index}</td>
                <td>
                  <a
                    href={`https://etherscan.io/address/${tx.to}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="address-link mono"
                  >
                    {shortAddress(tx.to)}
                  </a>
                </td>
                <td className="mono">{formatEth(tx.value)} ETH</td>
                <td>
                  <span
                    className="data-pill mono"
                    title={tx.data}
                  >
                    {shortData(tx.data)}
                  </span>
                </td>
                <td>
                  <div className="approvals-cell">
                    <span
                      className={`approval-count ${
                        canExecute ? "approval-count--ready" : ""
                      }`}
                    >
                      {tx.numApprovals}/{required}
                    </span>
                    <div className="approval-bar">
                      <div
                        className="approval-bar__fill"
                        style={{
                          width: `${Math.min(
                            100,
                            (tx.numApprovals / required) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>

                {isPending && isOwner && (
                  <td>
                    <div className="action-btns">
                      {!hasApproved ? (
                        <button
                          className="btn btn-sm btn-approve"
                          onClick={() => onApprove(tx.index)}
                          disabled={loading}
                          title="Approve this transaction"
                        >
                          Approve
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-revoke"
                          onClick={() => onRevoke(tx.index)}
                          disabled={loading}
                          title="Revoke your approval"
                        >
                          Revoke
                        </button>
                      )}
                      {canExecute && (
                        <button
                          className="btn btn-sm btn-execute"
                          onClick={() => onExecute(tx.index)}
                          disabled={loading}
                          title="Execute this transaction"
                        >
                          Execute
                        </button>
                      )}
                    </div>
                  </td>
                )}

                {!isPending && (
                  <td>
                    <span className="badge badge--green">Executed</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
