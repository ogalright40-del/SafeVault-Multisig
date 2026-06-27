// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title MultiSigWallet
 * @author Senior Web3 Architect
 * @notice A production-grade multi-signature wallet requiring M-of-N owner approvals
 *         before any transaction can be executed.
 * @dev Inherits ReentrancyGuard from OpenZeppelin to prevent reentrancy attacks.
 *      All state-changing functions emit events for complete on-chain auditability.
 *
 * Security model:
 *  - Only owners can submit, approve, revoke, or execute transactions.
 *  - Execution requires `required` distinct owner approvals.
 *  - ReentrancyGuard prevents re-entrant calls during ETH transfers.
 *  - Low-level `.call` is used instead of `.transfer` to avoid gas stipend issues.
 *  - Checks-Effects-Interactions pattern is strictly followed.
 */
contract MultiSigWallet is ReentrancyGuard {
    using Address for address payable;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when ETH is deposited into the wallet.
    event Deposit(address indexed sender, uint256 amount, uint256 balance);

    /// @notice Emitted when an owner submits a new transaction.
    event SubmitTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes data
    );

    /// @notice Emitted when an owner approves a pending transaction.
    event ApproveTransaction(address indexed owner, uint256 indexed txIndex);

    /// @notice Emitted when an owner revokes a previously given approval.
    event RevokeApproval(address indexed owner, uint256 indexed txIndex);

    /// @notice Emitted when a transaction has gathered enough approvals and is executed.
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);

    /// @notice Emitted when a transaction execution fails.
    event ExecutionFailure(uint256 indexed txIndex, bytes returnData);

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Ordered list of wallet owners. Immutable after construction.
    address[] public owners;

    /// @notice Quick lookup: is an address an owner?
    mapping(address => bool) public isOwner;

    /// @notice Number of approvals required to execute a transaction.
    uint256 public required;

    /// @dev Internal representation of a queued transaction.
    struct Transaction {
        address to;        // Destination address
        uint256 value;     // ETH value in wei
        bytes data;        // Encoded call data (for contract interactions)
        bool executed;     // Execution flag to prevent double-execution
        uint256 numApprovals; // Current approval count (gas-cheaper than iterating)
    }

    /// @notice All submitted transactions (pending + executed).
    Transaction[] public transactions;

    /// @dev approved[txIndex][owner] == true means `owner` has approved tx at `txIndex`.
    mapping(uint256 => mapping(address => bool)) public approved;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    /// @dev Restricts caller to wallet owners only.
    modifier onlyOwner() {
        require(isOwner[msg.sender], "MultiSigWallet: not owner");
        _;
    }

    /// @dev Validates that `_txIndex` points to an existing transaction.
    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "MultiSigWallet: tx does not exist");
        _;
    }

    /// @dev Ensures the transaction has not already been executed.
    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "MultiSigWallet: tx already executed");
        _;
    }

    /// @dev Ensures the caller has not already approved this transaction.
    modifier notApproved(uint256 _txIndex) {
        require(!approved[_txIndex][msg.sender], "MultiSigWallet: tx already approved");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploy the wallet with a fixed owner set and approval threshold.
     * @param _owners  Array of owner addresses (must be unique, non-zero, 1–50 addresses).
     * @param _required Number of approvals required (1 ≤ required ≤ len(_owners)).
     *
     * @dev Reverts on:
     *  - Empty owner list
     *  - More than 50 owners (gas safety)
     *  - `required` out of range
     *  - Duplicate or zero-address owner
     */
    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length > 0, "MultiSigWallet: owners required");
        require(_owners.length <= 50, "MultiSigWallet: too many owners");
        require(
            _required > 0 && _required <= _owners.length,
            "MultiSigWallet: invalid required count"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "MultiSigWallet: zero address owner");
            require(!isOwner[owner], "MultiSigWallet: duplicate owner");

            isOwner[owner] = true;
            owners.push(owner);
        }

        required = _required;
    }

    // -------------------------------------------------------------------------
    // Receive / Fallback
    // -------------------------------------------------------------------------

    /**
     * @notice Accept plain ETH transfers and emit a Deposit event.
     * @dev Emitting the current balance helps front-ends stay in sync via log polling.
     */
    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    // -------------------------------------------------------------------------
    // Owner actions
    // -------------------------------------------------------------------------

    /**
     * @notice Submit a new transaction for approval by other owners.
     * @param _to    Destination address (EOA or contract).
     * @param _value ETH to send, in wei.
     * @param _data  ABI-encoded function call data (empty for plain ETH transfers).
     * @return txIndex Index of the newly created transaction.
     *
     * @dev The submitting owner does NOT automatically approve their own transaction.
     *      This is an intentional design choice: it prevents a single owner from both
     *      submitting and unilaterally executing when required == 1 by accident. Each
     *      step (submit, approve, execute) is explicit.
     */
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external onlyOwner returns (uint256 txIndex) {
        require(_to != address(0), "MultiSigWallet: invalid destination");

        txIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                numApprovals: 0
            })
        );

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
    }

    /**
     * @notice Approve a pending transaction.
     * @param _txIndex Index of the transaction to approve.
     *
     * @dev Guards: txExists, notExecuted, notApproved.
     *      Updates both the per-owner mapping and the aggregate counter.
     */
    function approveTransaction(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        notApproved(_txIndex)
    {
        approved[_txIndex][msg.sender] = true;
        transactions[_txIndex].numApprovals += 1;

        emit ApproveTransaction(msg.sender, _txIndex);
    }

    /**
     * @notice Revoke a previously given approval.
     * @param _txIndex Index of the transaction.
     *
     * @dev Guards: txExists, notExecuted.
     *      Reverts if the caller has not approved this transaction.
     */
    function revokeApproval(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(approved[_txIndex][msg.sender], "MultiSigWallet: not approved");

        approved[_txIndex][msg.sender] = false;
        transactions[_txIndex].numApprovals -= 1;

        emit RevokeApproval(msg.sender, _txIndex);
    }

    /**
     * @notice Execute an approved transaction once the threshold is reached.
     * @param _txIndex Index of the transaction to execute.
     *
     * @dev Follows Checks-Effects-Interactions:
     *  1. Checks: ownership, existence, approval count, not-already-executed.
     *  2. Effects: mark as executed BEFORE the external call.
     *  3. Interactions: perform the external call.
     *
     *  If the call reverts, the execution flag is reset so the tx can be retried
     *  after fixing the underlying condition (e.g. insufficient balance).
     *  ReentrancyGuard prevents re-entrant calls during step 3.
     */
    function executeTransaction(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        nonReentrant
    {
        Transaction storage transaction = transactions[_txIndex];

        require(
            transaction.numApprovals >= required,
            "MultiSigWallet: insufficient approvals"
        );

        // Effects: mark executed before external call (CEI pattern)
        transaction.executed = true;

        // Interactions: low-level call to handle arbitrary gas needs
        (bool success, bytes memory returnData) = transaction.to.call{
            value: transaction.value
        }(transaction.data);

        if (success) {
            emit ExecuteTransaction(msg.sender, _txIndex);
        } else {
            // Reset executed flag so the transaction can be retried
            transaction.executed = false;
            emit ExecutionFailure(_txIndex, returnData);
            revert("MultiSigWallet: tx execution failed");
        }
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Return all wallet owners.
     * @return Array of owner addresses.
     */
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    /**
     * @notice Return the total number of submitted transactions.
     * @return count Transaction count (pending + executed).
     */
    function getTransactionCount() external view returns (uint256 count) {
        return transactions.length;
    }

    /**
     * @notice Return full details of a single transaction.
     * @param _txIndex Transaction index.
     * @return to            Destination address.
     * @return value         ETH value in wei.
     * @return data          Encoded call data.
     * @return executed      Whether the transaction has been executed.
     * @return numApprovals  Current approval count.
     */
    function getTransaction(uint256 _txIndex)
        external
        view
        txExists(_txIndex)
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numApprovals
        )
    {
        Transaction storage transaction = transactions[_txIndex];
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numApprovals
        );
    }

    /**
     * @notice Check whether a specific owner has approved a specific transaction.
     * @param _txIndex Transaction index.
     * @param _owner   Owner address to query.
     * @return True if `_owner` has approved `_txIndex`.
     */
    function hasApproved(uint256 _txIndex, address _owner)
        external
        view
        returns (bool)
    {
        return approved[_txIndex][_owner];
    }

    /**
     * @notice Current ETH balance of the wallet.
     * @return balance in wei.
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Returns a paginated list of transactions.
     * @param _from  Start index (inclusive).
     * @param _to    End index (exclusive, capped at transactions.length).
     * @return txList Array of Transaction structs in the requested range.
     *
     * @dev Front-ends should call this with small page sizes to avoid block gas limits.
     */
    function getTransactions(uint256 _from, uint256 _to)
        external
        view
        returns (Transaction[] memory txList)
    {
        uint256 total = transactions.length;
        if (_to > total) _to = total;
        require(_from <= _to, "MultiSigWallet: invalid range");

        txList = new Transaction[](_to - _from);
        for (uint256 i = _from; i < _to; i++) {
            txList[i - _from] = transactions[i];
        }
    }
}
